/**
 * Service for scoring job suitability using AI.
 */

import { logger } from "@infra/logger";
import { getDefaultPromptTemplate } from "@shared/prompt-template-definitions.js";
import type { Job, JobBrief } from "@shared/types";
import type { JsonSchemaDefinition } from "./llm/types";
import { stripMarkdownCodeFences } from "./llm/utils/json";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";
import { renderPromptTemplate } from "./prompt-templates";
import { getEffectiveSettings } from "./settings";

export class LlmNotConfiguredError extends Error {
  constructor(message?: string) {
    super(message ?? "LLM API key not configured");
    this.name = "LlmNotConfiguredError";
  }
}

interface SuitabilityResult {
  score: number | null; // 0-100, or null when scoring failed
  reason: string; // Explanation
  jobBrief: string | null;
}

type ScoringPreferences = {
  instructions: string;
  promptTemplate: string;
};

type ProfileRecord = Record<string, unknown>;

/** JSON schema for suitability scoring response */
const SCORING_SCHEMA: JsonSchemaDefinition = {
  name: "job_suitability_score",
  schema: {
    type: "object",
    properties: {
      score: {
        type: "integer",
        description: "Suitability score from 0 to 100",
      },
      reason: {
        type: "string",
        description: "Brief 1-2 sentence explanation of the score",
      },
      jobBrief: {
        type: "object",
        properties: {
          role_summary: {
            type: "string",
            description: "One sentence summarizing what the person would do",
          },
          they_want: {
            type: "array",
            maxItems: 6,
            items: { type: "string" },
          },
          specifics: {
            type: "array",
            maxItems: 18,
            items: { type: "string" },
          },
          company_offers: {
            type: "array",
            maxItems: 5,
            items: { type: "string" },
          },
          practical_details: {
            type: "array",
            maxItems: 8,
            items: { type: "string" },
          },
          missing_or_unclear: {
            type: "array",
            maxItems: 5,
            items: { type: "string" },
          },
          repeated_signals: {
            type: "array",
            maxItems: 5,
            items: { type: "string" },
          },
        },
        required: [
          "role_summary",
          "they_want",
          "specifics",
          "company_offers",
          "practical_details",
          "missing_or_unclear",
          "repeated_signals",
        ],
        additionalProperties: false,
      },
    },
    required: ["score", "reason", "jobBrief"],
    additionalProperties: false,
  },
};

const SCORING_OUTPUT_INSTRUCTIONS = `
Also extract a concise job brief from the job description. The brief must only use stated information, remain neutral, remove employer fluff, and never judge candidate fit. Use "Not stated" for missing practical details.

Respond with ONLY valid JSON in this exact shape:
{
  "score": <integer 0-100>,
  "reason": "<1-2 sentence explanation>",
  "jobBrief": {
    "role_summary": "<one sentence describing what the person would do>",
    "they_want": ["<up to 6 stated requirements>"],
    "specifics": ["<up to 18 concrete tools, responsibilities, domain or working-pattern details>"],
    "company_offers": ["<up to 5 concrete offerings>"],
    "practical_details": ["<up to 8 key-value details such as Salary: Not stated>"],
    "missing_or_unclear": ["<up to 5 important missing details>"],
    "repeated_signals": ["<up to 5 repeated themes>"]
  }
}
No markdown, code fences, or text outside the JSON.`.trim();

const NON_SOURCE_JOB_FIELDS = new Set<keyof Job>([
  "id",
  "locationMatch",
  "status",
  "outcome",
  "closedAt",
  "suitabilityScore",
  "suitabilityReason",
  "jobBrief",
  "tailoredSummary",
  "tailoredHeadline",
  "tailoredSkills",
  "selectedProjectIds",
  "pdfPath",
  "pdfSource",
  "pdfRegenerating",
  "pdfFreshness",
  "pdfFingerprint",
  "pdfGeneratedAt",
  "tracerLinksEnabled",
  "sponsorMatchScore",
  "sponsorMatchNames",
  "appliedDuplicateMatch",
  "discoveredAt",
  "processedAt",
  "readyAt",
  "appliedAt",
  "createdAt",
  "updatedAt",
]);

/**
 * Check if a job's salary field is missing/empty.
 * Returns true for null, empty string, or whitespace-only strings.
 */
function isSalaryMissing(salary: string | null): boolean {
  return salary === null || salary.trim() === "";
}

/**
 * Apply salary penalty to a score if enabled.
 * Returns the adjusted score, adjusted reason, and whether penalty was applied.
 */
function applySalaryPenalty(
  job: Job,
  originalScore: number,
  originalReason: string,
  settings: { penalizeMissingSalary: boolean; missingSalaryPenalty: number },
): { score: number; reason: string; penaltyApplied: boolean } {
  if (!settings.penalizeMissingSalary || !isSalaryMissing(job.salary)) {
    return {
      score: originalScore,
      reason: originalReason,
      penaltyApplied: false,
    };
  }

  const penalty = settings.missingSalaryPenalty;
  const adjustedScore = Math.max(0, originalScore - penalty);
  const penaltyText = `Score reduced by ${penalty} points due to missing salary information.`;
  const adjustedReason = `${originalReason} ${penaltyText}`;

  logger.info("Applied salary penalty", {
    jobId: job.id,
    originalScore,
    penalty,
    finalScore: adjustedScore,
  });

  return { score: adjustedScore, reason: adjustedReason, penaltyApplied: true };
}

/**
 * Score a job's suitability based on profile and job description.
 * Includes retry logic for when AI returns garbage responses.
 */
export async function scoreJobSuitability(
  job: Job,
  profile: Record<string, unknown>,
  options: { scoringInstructions?: string } = {},
): Promise<SuitabilityResult> {
  const [model, settings] = await Promise.all([
    resolveLlmModel("scoring"),
    getEffectiveSettings(),
  ]);
  const scoringInstructions = Object.hasOwn(options, "scoringInstructions")
    ? (options.scoringInstructions ?? "")
    : (settings.scoringInstructions?.value ?? "");

  const prompt = buildScoringPrompt(job, sanitizeProfileForPrompt(profile), {
    instructions: scoringInstructions,
    promptTemplate:
      settings.scoringPromptTemplate?.value ??
      getDefaultPromptTemplate("scoringPromptTemplate"),
  });

  const llm = await createConfiguredLlmService("scoring");
  const result = await llm.callJson<{
    score: number;
    reason: string;
    jobBrief: JobBrief;
  }>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: SCORING_SCHEMA,
    maxRetries: 2,
    jobId: job.id,
  });

  if (!result.success) {
    logger.warn("Scoring failed — pausing pipeline", {
      jobId: job.id,
      error: result.error,
    });
    throw new LlmNotConfiguredError(
      `AI scoring failed: ${result.error}. Check your LLM configuration in Settings → Integrations, then resume scoring.`,
    );
  }

  const { score, reason } = result.data;

  // Validate we got a reasonable response
  if (typeof score !== "number" || Number.isNaN(score)) {
    logger.warn("Invalid score in AI response — pausing pipeline", {
      jobId: job.id,
    });
    throw new LlmNotConfiguredError(
      "AI returned invalid scoring data. Check your LLM configuration in Settings → Integrations, then resume scoring.",
    );
  }

  const clampedScore = Math.min(100, Math.max(0, Math.round(score)));
  const clampedReason = reason || "No explanation provided";

  // Apply salary penalty if enabled
  const penaltyResult = applySalaryPenalty(job, clampedScore, clampedReason, {
    penalizeMissingSalary: settings.penalizeMissingSalary.value,
    missingSalaryPenalty: settings.missingSalaryPenalty.value,
  });

  return {
    score: penaltyResult.score,
    reason: penaltyResult.reason,
    jobBrief:
      job.jobDescription?.trim() && result.data.jobBrief
        ? JSON.stringify(result.data.jobBrief)
        : null,
  };
}

/**
 * Robustly parse JSON from AI-generated content.
 * Handles common AI quirks: markdown fences, extra text, trailing commas, etc.
 *
 * @deprecated Use LlmService with structured outputs instead. Kept for backwards compatibility with tests.
 */
export function parseJsonFromContent(
  content: string,
  jobId?: string,
): { score?: number; reason?: string } {
  const originalContent = content;
  let candidate = content.trim();

  // Step 1: Remove markdown code fences (with or without language specifier)
  candidate = stripMarkdownCodeFences(candidate);

  // Step 2: Try to extract JSON object if there's surrounding text
  const jsonMatch = candidate.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    candidate = jsonMatch[0];
  }

  // Step 3: Try direct parse first
  try {
    return JSON.parse(candidate);
  } catch {
    // Continue with sanitization
  }

  // Step 4: Fix common JSON issues
  let sanitized = candidate;

  // Remove JavaScript-style comments (// and /* */)
  sanitized = sanitized.replace(/\/\/[^\n]*/g, "");
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, "");

  // Remove trailing commas before } or ]
  sanitized = sanitized.replace(/,\s*([\]}])/g, "$1");

  // Fix unquoted keys: word: -> "word":
  // Be more careful - only match at start of object or after comma
  sanitized = sanitized.replace(
    /([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g,
    '$1"$2":',
  );

  // Fix single quotes to double quotes
  sanitized = sanitized.replace(/'/g, '"');

  // Remove ALL control characters (including newlines/tabs INSIDE string values which break JSON)
  // First, let's normalize the string - escape actual newlines inside strings
  // biome-ignore lint/suspicious/noControlCharactersInRegex: needed to fix broken JSON from AI
  const controlCharsRegex = /[\x00-\x1F\x7F]/g;
  sanitized = sanitized.replace(controlCharsRegex, (match) => {
    if (match === "\n") return "\\n";
    if (match === "\r") return "\\r";
    if (match === "\t") return "\\t";
    return "";
  });

  // Step 5: Try parsing the sanitized version
  try {
    return JSON.parse(sanitized);
  } catch {
    // Continue with more aggressive extraction
  }

  // Step 6: Even more aggressive - try to rebuild a minimal valid JSON
  // by extracting just the score and reason values
  const scoreMatch = originalContent.match(
    /["']?score["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i,
  );
  const reasonMatch =
    originalContent.match(/["']?reason["']?\s*[:=]\s*["']([^"'\n]+)["']/i) ||
    originalContent.match(
      /["']?reason["']?\s*[:=]\s*["']?(.*?)["']?\s*[,}\n]/is,
    );

  if (scoreMatch) {
    const score = Math.round(parseFloat(scoreMatch[1]));
    const reason = reasonMatch
      ? reasonMatch[1].trim().replace(controlCharsRegex, "")
      : "Score extracted from malformed response";
    logger.warn("Parsed score via regex fallback", {
      jobId: jobId || "unknown",
      score,
    });
    return { score, reason };
  }

  // Log the failure with full content for debugging
  logger.error("Failed to parse AI response", {
    jobId: jobId || "unknown",
    rawSample: originalContent.substring(0, 500),
    sanitizedSample: sanitized.substring(0, 500),
  });

  throw new Error("Unable to parse JSON from model response");
}

function buildScoringPrompt(
  job: Job,
  profile: Record<string, unknown>,
  preferences: ScoringPreferences,
): string {
  const jobJson = JSON.stringify(
    Object.fromEntries(
      Object.entries(job).filter(
        ([key]) => !NON_SOURCE_JOB_FIELDS.has(key as keyof Job),
      ),
    ),
  );

  return `${renderPromptTemplate(preferences.promptTemplate, {
    profileJson: JSON.stringify(profile),
    jobTitle: job.title,
    employer: job.employer,
    location: job.location || "Not specified",
    salary: job.salary || "Not specified",
    degreeRequired: job.degreeRequired || "Not specified",
    disciplines: job.disciplines || "Not specified",
    jobDescription: job.jobDescription || "No description available",
    scoringInstructionsText: preferences.instructions
      ? preferences.instructions
      : "No additional custom scoring instructions.",
  })}\n\nJOB DATA (JSON):\n${jobJson}\n\n${SCORING_OUTPUT_INSTRUCTIONS}`;
}

function sanitizeProfileForPrompt(
  profile: Record<string, unknown>,
): Record<string, unknown> {
  return {
    basics: sanitizeBasics(profile.basics),
    skills: sanitizeItems(profile, "skills", [
      "name",
      "description",
      "level",
      "proficiency",
      "keywords",
    ]),
    experience: sanitizeItems(profile, "experience", [
      "company",
      "position",
      "location",
      "date",
      "period",
      "summary",
      "description",
    ]),
    projects: sanitizeItems(profile, "projects", [
      "name",
      "description",
      "date",
      "period",
      "summary",
      "keywords",
    ]),
    education: sanitizeItems(profile, "education", [
      "school",
      "institution",
      "degree",
      "area",
      "grade",
      "location",
      "date",
      "period",
      "summary",
      "description",
    ]),
    languages: sanitizeItems(profile, "languages", [
      "language",
      "fluency",
      "level",
    ]),
    awards: sanitizeItems(profile, "awards", [
      "title",
      "awarder",
      "date",
      "summary",
      "description",
    ]),
    certifications: sanitizeItems(profile, "certifications", [
      "title",
      "issuer",
      "date",
      "summary",
      "description",
    ]),
    publications: sanitizeItems(profile, "publications", [
      "title",
      "publisher",
      "date",
      "summary",
      "description",
    ]),
    volunteer: sanitizeItems(profile, "volunteer", [
      "organization",
      "position",
      "location",
      "date",
      "period",
      "summary",
      "description",
    ]),
    interests: sanitizeItems(profile, "interests", [
      "name",
      "summary",
      "description",
      "keywords",
    ]),
  };
}

function sanitizeBasics(value: unknown): ProfileRecord {
  if (!isRecord(value)) return {};
  return pickDefined(value, ["label", "headline", "summary", "location"]);
}

function sanitizeItems(
  profile: ProfileRecord,
  sectionKey: string,
  allowedKeys: string[],
): ProfileRecord[] {
  return collectSectionItems(profile, sectionKey)
    .filter(isVisibleCvItem)
    .map((item) => sanitizeCvItem(item, allowedKeys))
    .filter((item) => Object.keys(item).length > 0);
}

function collectSectionItems(
  profile: ProfileRecord,
  sectionKey: string,
): ProfileRecord[] {
  const sections = isRecord(profile.sections) ? profile.sections : {};
  const section = sections[sectionKey];

  if (isRecord(section)) {
    if (!isVisibleCvItem(section)) return [];
    if (Array.isArray(section.items)) {
      return section.items.filter(isRecord);
    }
  }

  const topLevelSection = profile[sectionKey];
  if (Array.isArray(topLevelSection)) return topLevelSection.filter(isRecord);
  if (isRecord(topLevelSection)) {
    if (!isVisibleCvItem(topLevelSection)) return [];
    if (Array.isArray(topLevelSection.items)) {
      return topLevelSection.items.filter(isRecord);
    }
  }

  return [];
}

function sanitizeCvItem(
  item: ProfileRecord,
  allowedKeys: string[],
): ProfileRecord {
  const sanitized = pickDefined(item, allowedKeys);
  if (Array.isArray(item.roles)) {
    const roles = item.roles
      .filter(isRecord)
      .filter(isVisibleCvItem)
      .map((role) =>
        pickDefined(role, ["position", "period", "summary", "description"]),
      )
      .filter((role) => Object.keys(role).length > 0);
    if (roles.length > 0) sanitized.roles = roles;
  }
  return sanitized;
}

function pickDefined(source: ProfileRecord, keys: string[]): ProfileRecord {
  const result: ProfileRecord = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== "") {
      result[key] = value;
    }
  }
  return result;
}

function isVisibleCvItem(item: ProfileRecord): boolean {
  if (item.hidden === true) return false;
  if (item.visible === false) return false;
  return true;
}

function isRecord(value: unknown): value is ProfileRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Score multiple jobs and return sorted by score (descending).
 */
export async function scoreAndRankJobs(
  jobs: Job[],
  profile: Record<string, unknown>,
): Promise<
  Array<Job & { suitabilityScore: number | null; suitabilityReason: string }>
> {
  const scoredJobs = await Promise.all(
    jobs.map(async (job) => {
      const { score, reason } = await scoreJobSuitability(job, profile);
      return {
        ...job,
        suitabilityScore: score,
        suitabilityReason: reason,
      };
    }),
  );

  return scoredJobs.sort((a, b) => {
    if (a.suitabilityScore == null && b.suitabilityScore == null) return 0;
    if (a.suitabilityScore == null) return 1;
    if (b.suitabilityScore == null) return -1;
    return b.suitabilityScore - a.suitabilityScore;
  });
}
