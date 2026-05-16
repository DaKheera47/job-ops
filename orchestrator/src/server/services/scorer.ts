/**
 * Service for scoring job suitability using AI.
 */

import { logger } from "@infra/logger";
import { getDefaultPromptTemplate } from "@shared/prompt-template-definitions.js";
import type { Job, JobMatchAnalysis } from "@shared/types";
import type { JsonSchemaDefinition } from "./llm/types";
import { stripMarkdownCodeFences } from "./llm/utils/json";
import { createConfiguredLlmService, resolveLlmModel } from "./modelSelection";
import { renderPromptTemplate } from "./prompt-templates";
import { getEffectiveSettings } from "./settings";

interface SuitabilityResult {
  score: number; // 0-100
  reason: string; // Explanation
  matchAnalysis?: JobMatchAnalysis;
}

type ScoringPreferences = {
  instructions: string;
  promptTemplate: string;
};

interface RichScoreResponse {
  score: number;
  reason: string;
  requirements?: JobMatchAnalysis["requirements"];
  skills?: JobMatchAnalysis["skills"];
  experience?: JobMatchAnalysis["experience"];
  keywords?: JobMatchAnalysis["keywords"];
  dealBreakers?: string[];
  tailoringTips?: string[];
}

function buildMatchAnalysisFromResponse(
  data: RichScoreResponse,
): JobMatchAnalysis | undefined {
  // Only build the analysis if at least one rich field is populated. Older
  // models / providers may ignore the optional schema fields and return only
  // {score, reason} — keep behaviour identical in that case.
  const hasRichData =
    data.requirements ||
    data.skills ||
    data.experience ||
    data.keywords ||
    (Array.isArray(data.dealBreakers) && data.dealBreakers.length > 0) ||
    (Array.isArray(data.tailoringTips) && data.tailoringTips.length > 0);
  if (!hasRichData) return undefined;

  return {
    requirements: {
      met: data.requirements?.met ?? [],
      missing: data.requirements?.missing ?? [],
      partial: data.requirements?.partial ?? [],
    },
    skills: {
      matched: data.skills?.matched ?? [],
      missing: data.skills?.missing ?? [],
      transferable: data.skills?.transferable ?? [],
      bonus: data.skills?.bonus ?? [],
    },
    experience: {
      levelMatch: data.experience?.levelMatch ?? "unknown",
      yearsRequired: data.experience?.yearsRequired ?? null,
      yearsApparent: data.experience?.yearsApparent ?? null,
    },
    keywords: {
      addToResume: data.keywords?.addToResume ?? [],
    },
    dealBreakers: Array.isArray(data.dealBreakers) ? data.dealBreakers : [],
    tailoringTips: Array.isArray(data.tailoringTips) ? data.tailoringTips : [],
  };
}

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
      requirements: {
        type: "object",
        description:
          "Itemized requirements breakdown extracted from job description",
        properties: {
          met: {
            type: "array",
            items: { type: "string" },
            description: "Requirements clearly satisfied by the candidate",
          },
          missing: {
            type: "array",
            items: { type: "string" },
            description: "Hard requirements absent from candidate profile",
          },
          partial: {
            type: "array",
            items: { type: "string" },
            description: "Requirements only partially or weakly covered",
          },
        },
        required: ["met", "missing", "partial"],
        additionalProperties: false,
      },
      skills: {
        type: "object",
        description:
          "Skills mapping between candidate profile and job description",
        properties: {
          matched: {
            type: "array",
            items: { type: "string" },
            description: "Skills explicitly required by JD AND in profile",
          },
          missing: {
            type: "array",
            items: { type: "string" },
            description:
              "Skills explicitly required by JD but absent from profile",
          },
          transferable: {
            type: "array",
            items: { type: "string" },
            description:
              "Profile skills that map to JD requirements via analogous experience",
          },
          bonus: {
            type: "array",
            items: { type: "string" },
            description:
              "Profile skills not required but valuable for the role",
          },
        },
        required: ["matched", "missing", "transferable", "bonus"],
        additionalProperties: false,
      },
      experience: {
        type: "object",
        properties: {
          levelMatch: {
            type: "string",
            enum: ["below", "match", "above", "unknown"],
            description: "Whether candidate seniority matches the role",
          },
          yearsRequired: {
            type: ["integer", "null"],
            description: "Years explicitly required by the JD, null if unknown",
          },
          yearsApparent: {
            type: ["integer", "null"],
            description: "Apparent years from candidate profile, null if unknown",
          },
        },
        required: ["levelMatch", "yearsRequired", "yearsApparent"],
        additionalProperties: false,
      },
      keywords: {
        type: "object",
        properties: {
          addToResume: {
            type: "array",
            items: { type: "string" },
            description:
              "Exact JD phrases the candidate should add verbatim for ATS matching",
          },
        },
        required: ["addToResume"],
        additionalProperties: false,
      },
      dealBreakers: {
        type: "array",
        items: { type: "string" },
        description:
          "Hard blockers that make this role unrealistic for the candidate (e.g. citizenship, on-site only).",
      },
      tailoringTips: {
        type: "array",
        items: { type: "string" },
        description:
          "Specific concrete edits to apply to resume/cover letter for this role.",
      },
    },
    required: ["score", "reason"],
    additionalProperties: false,
  },
};

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
): Promise<SuitabilityResult> {
  const [model, settings] = await Promise.all([
    resolveLlmModel("scoring"),
    getEffectiveSettings(),
  ]);

  const prompt = buildScoringPrompt(job, sanitizeProfileForPrompt(profile), {
    instructions: settings.scoringInstructions?.value ?? "",
    promptTemplate:
      settings.scoringPromptTemplate?.value ??
      getDefaultPromptTemplate("scoringPromptTemplate"),
  });

  const llm = await createConfiguredLlmService();
  const result = await llm.callJson<RichScoreResponse>({
    model,
    messages: [{ role: "user", content: prompt }],
    jsonSchema: SCORING_SCHEMA,
    maxRetries: 2,
    jobId: job.id,
  });

  if (!result.success) {
    if (result.error.toLowerCase().includes("api key")) {
      logger.warn("LLM API key not set, using mock scoring", { jobId: job.id });
    }
    logger.error("Scoring failed, using mock scoring", {
      jobId: job.id,
      error: result.error,
    });
    return mockScore(job, {
      penalizeMissingSalary: settings.penalizeMissingSalary.value,
      missingSalaryPenalty: settings.missingSalaryPenalty.value,
    });
  }

  const { score, reason } = result.data;

  // Validate we got a reasonable response
  if (typeof score !== "number" || Number.isNaN(score)) {
    logger.error("Invalid score in AI response, using mock scoring", {
      jobId: job.id,
    });
    return mockScore(job, {
      penalizeMissingSalary: settings.penalizeMissingSalary.value,
      missingSalaryPenalty: settings.missingSalaryPenalty.value,
    });
  }

  const clampedScore = Math.min(100, Math.max(0, Math.round(score)));
  const clampedReason = reason || "No explanation provided";
  const matchAnalysis = buildMatchAnalysisFromResponse(result.data);

  // Apply salary penalty if enabled
  const penaltyResult = applySalaryPenalty(job, clampedScore, clampedReason, {
    penalizeMissingSalary: settings.penalizeMissingSalary.value,
    missingSalaryPenalty: settings.missingSalaryPenalty.value,
  });

  return {
    score: penaltyResult.score,
    reason: penaltyResult.reason,
    matchAnalysis,
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

// Hard cap on job description length we pass to the LLM. Anything past 8 KB
// is almost always boilerplate ("About our company", "Equal opportunity
// statement", "Benefits", multilingual repeats) — keeping the cap saves
// 5-15% input tokens on a typical run and ~50% on long wall-of-text postings
// (max in the corpus was 19 KB). Truncation happens at a word boundary
// followed by an explicit "... [description truncated]" marker so the LLM
// knows the cut-off was deliberate.
const JOB_DESCRIPTION_MAX_CHARS = 8000;
const TRUNCATION_MARKER = "\n\n... [description truncated]";

function truncateJobDescription(raw: string | null | undefined): string {
  if (!raw) return "No description available";
  if (raw.length <= JOB_DESCRIPTION_MAX_CHARS) return raw;
  const head = raw.slice(0, JOB_DESCRIPTION_MAX_CHARS);
  const lastBoundary = head.lastIndexOf(" ");
  const safeHead =
    lastBoundary > JOB_DESCRIPTION_MAX_CHARS * 0.9
      ? head.slice(0, lastBoundary)
      : head;
  return `${safeHead}${TRUNCATION_MARKER}`;
}

function buildScoringPrompt(
  job: Job,
  profile: Record<string, unknown>,
  preferences: ScoringPreferences,
): string {
  return renderPromptTemplate(preferences.promptTemplate, {
    profileJson: JSON.stringify(profile, null, 2),
    jobTitle: job.title,
    employer: job.employer,
    location: job.location || "Not specified",
    salary: job.salary || "Not specified",
    degreeRequired: job.degreeRequired || "Not specified",
    disciplines: job.disciplines || "Not specified",
    jobDescription: truncateJobDescription(job.jobDescription),
    scoringInstructionsText: preferences.instructions
      ? preferences.instructions
      : "No additional custom scoring instructions.",
  });
}

function sanitizeProfileForPrompt(
  profile: Record<string, unknown>,
): Record<string, unknown> {
  const p = profile as {
    basics?: Record<string, unknown>;
    sections?: {
      skills?: unknown;
      experience?: { items?: unknown[] };
      projects?: { items?: unknown[] };
      education?: { items?: unknown[] };
    };
  };

  const experienceItems = Array.isArray(p.sections?.experience?.items)
    ? p.sections?.experience?.items.slice(0, 5)
    : [];
  const projectItems = Array.isArray(p.sections?.projects?.items)
    ? p.sections?.projects?.items.slice(0, 6)
    : [];

  return {
    basics: {
      label: p.basics?.label,
      summary: p.basics?.summary,
    },
    skills: p.sections?.skills ?? null,
    experience: experienceItems,
    projects: projectItems,
    education: p.sections?.education?.items ?? [],
  };
}

async function mockScore(
  job: Job,
  settings: { penalizeMissingSalary: boolean; missingSalaryPenalty: number },
): Promise<SuitabilityResult> {
  // Simple keyword-based scoring as fallback
  const jd = (job.jobDescription || "").toLowerCase();
  const title = job.title.toLowerCase();

  const goodKeywords = [
    "typescript",
    "react",
    "node",
    "python",
    "web",
    "frontend",
    "backend",
    "fullstack",
    "software",
    "engineer",
    "developer",
  ];
  const badKeywords = [
    "senior",
    "5+ years",
    "10+ years",
    "principal",
    "staff",
    "manager",
  ];

  let score = 50;

  for (const kw of goodKeywords) {
    if (jd.includes(kw) || title.includes(kw)) score += 5;
  }

  for (const kw of badKeywords) {
    if (jd.includes(kw) || title.includes(kw)) score -= 10;
  }

  score = Math.min(100, Math.max(0, score));

  const baseReason = "Scored using keyword matching (API key not configured)";

  // Apply salary penalty if enabled
  const penaltyResult = applySalaryPenalty(job, score, baseReason, settings);

  return {
    score: penaltyResult.score,
    reason: penaltyResult.reason,
  };
}

/**
 * Score multiple jobs and return sorted by score (descending).
 */
export async function scoreAndRankJobs(
  jobs: Job[],
  profile: Record<string, unknown>,
): Promise<
  Array<Job & { suitabilityScore: number; suitabilityReason: string }>
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

  return scoredJobs.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
}
