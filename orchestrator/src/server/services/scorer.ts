/**
 * Service for scoring job suitability using AI.
 */

import { logger } from "@infra/logger";
import type { Job } from "@shared/types";
import { getSetting } from "../repositories/settings";
import { type JsonSchemaDefinition, LlmService } from "./llm-service";

interface SuitabilityResult {
  score: number; // 0-100
  reason: string; // Explanation
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
    },
    required: ["score", "reason"],
    additionalProperties: false,
  },
};

/**
 * Score a job's suitability based on profile and job description.
 * Includes retry logic for when AI returns garbage responses.
 */
export async function scoreJobSuitability(
  job: Job,
  profile: Record<string, unknown>,
): Promise<SuitabilityResult> {
  const [overrideModel, overrideModelScorer] = await Promise.all([
    getSetting("model"),
    getSetting("modelScorer"),
  ]);
  // Precedence: Scorer-specific override > Global override > Env var > Default
  const model =
    overrideModelScorer ||
    overrideModel ||
    process.env.MODEL ||
    "google/gemini-3-flash-preview";

  const prompt = buildScoringPrompt(job, sanitizeProfileForPrompt(profile));

  const llm = new LlmService();
  const result = await llm.callJson<{ score: number; reason: string }>({
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
    return mockScore(job);
  }

  const { score, reason } = result.data;

  // Validate we got a reasonable response
  if (typeof score !== "number" || Number.isNaN(score)) {
    logger.error("Invalid score in AI response, using mock scoring", {
      jobId: job.id,
    });
    return mockScore(job);
  }

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    reason: reason || "No explanation provided",
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
  candidate = candidate
    .replace(/```(?:json|JSON)?\s*/g, "")
    .replace(/```/g, "")
    .trim();

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
): string {
  return `You are evaluating a job listing for a candidate. Score how suitable this job is for the candidate on a scale of 0-100.

SCORING CRITERIA:
- Skills match (technologies, frameworks, languages): 0-30 points
- Experience level match: 0-25 points
- Location/remote work alignment: 0-15 points
- Industry/domain fit: 0-15 points
- Career growth potential: 0-15 points

CANDIDATE PROFILE:
${JSON.stringify(profile, null, 2)}

JOB LISTING:
Title: ${job.title}
Employer: ${job.employer}
Location: ${job.location || "Not specified"}
Salary: ${job.salary || "Not specified"}
Degree Required: ${job.degreeRequired || "Not specified"}
Disciplines: ${job.disciplines || "Not specified"}

JOB DESCRIPTION:
${job.jobDescription || "No description available"}

IMPORTANT: Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside the JSON.

REQUIRED FORMAT (exactly this structure):
{"score": <integer 0-100>, "reason": "<1-2 sentence explanation>"}

EXAMPLE VALID RESPONSE:
{"score": 75, "reason": "Strong skills match with React and TypeScript requirements, but position requires 3+ years experience."}`;
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

function mockScore(job: Job): SuitabilityResult {
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

  return {
    score,
    reason: "Scored using keyword matching (API key not configured)",
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
