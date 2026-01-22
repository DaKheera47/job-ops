/**
 * Service for scoring job suitability using AI.
 */

import type { Job } from '../../shared/types.js';
import { getSetting } from '../repositories/settings.js';
import { callOpenRouter, type JsonSchemaDefinition } from './openrouter.js';

interface SuitabilityResult {
  score: number;        // 0-100
  reason: string;       // Explanation
}

/** JSON schema for suitability scoring response */
const SCORING_SCHEMA: JsonSchemaDefinition = {
  name: 'job_suitability_score',
  schema: {
    type: 'object',
    properties: {
      score: {
        type: 'integer',
        description: 'Suitability score from 0 to 100',
      },
      reason: {
        type: 'string',
        description: 'Brief 1-2 sentence explanation of the score',
      },
    },
    required: ['score', 'reason'],
    additionalProperties: false,
  },
};

/**
 * Score a job's suitability based on profile and job description.
 * Includes retry logic for when AI returns garbage responses.
 */
export async function scoreJobSuitability(
  job: Job,
  profile: Record<string, unknown>
): Promise<SuitabilityResult> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('⚠️ OPENROUTER_API_KEY not set, using mock scoring');
    return mockScore(job);
  }

  const [overrideModel, overrideModelScorer] = await Promise.all([
    getSetting('model'),
    getSetting('modelScorer'),
  ]);
  // Precedence: Scorer-specific override > Global override > Env var > Default
  const model = overrideModelScorer || overrideModel || process.env.MODEL || 'openai/gpt-4o-mini';

  const prompt = buildScoringPrompt(job, profile);

  const result = await callOpenRouter<{ score: number; reason: string }>({
    model,
    messages: [{ role: 'user', content: prompt }],
    jsonSchema: SCORING_SCHEMA,
    maxRetries: 2,
    jobId: job.id,
  });

  if (!result.success) {
    console.error(`❌ [Job ${job.id}] Scoring failed: ${result.error}, using mock scoring`);
    return mockScore(job);
  }

  const { score, reason } = result.data;

  // Validate we got a reasonable response
  if (typeof score !== 'number' || isNaN(score)) {
    console.error(`❌ [Job ${job.id}] Invalid score in response, using mock scoring`);
    return mockScore(job);
  }

  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    reason: reason || 'No explanation provided',
  };
}

/**
 * Robustly parse JSON from AI-generated content.
 * Handles common AI quirks: markdown fences, extra text, trailing commas, etc.
 * 
 * @deprecated Use callOpenRouter with structured outputs instead. Kept for backwards compatibility with tests.
 */
export function parseJsonFromContent(content: string, jobId?: string): { score?: number; reason?: string } {
  const originalContent = content;
  let candidate = content.trim();

  // Step 1: Remove markdown code fences (with or without language specifier)
  candidate = candidate.replace(/```(?:json|JSON)?\s*/g, '').replace(/```/g, '').trim();

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
  sanitized = sanitized.replace(/\/\/[^\n]*/g, '');
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, '');

  // Remove trailing commas before } or ]
  sanitized = sanitized.replace(/,\s*([\]}])/g, '$1');

  // Fix unquoted keys: word: -> "word":
  // Be more careful - only match at start of object or after comma
  sanitized = sanitized.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');

  // Fix single quotes to double quotes
  sanitized = sanitized.replace(/'/g, '"');

  // Remove ALL control characters (including newlines/tabs INSIDE string values which break JSON)
  // First, let's normalize the string - escape actual newlines inside strings
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, (match) => {
    if (match === '\n') return '\\n';
    if (match === '\r') return '\\r';
    if (match === '\t') return '\\t';
    return '';
  });

  // Step 5: Try parsing the sanitized version
  try {
    return JSON.parse(sanitized);
  } catch {
    // Continue with more aggressive extraction
  }

  // Step 6: Even more aggressive - try to rebuild a minimal valid JSON
  // by extracting just the score and reason values
  const scoreMatch = originalContent.match(/["']?score["']?\s*[:=]\s*(\d+(?:\.\d+)?)/i);
  const reasonMatch = originalContent.match(/["']?reason["']?\s*[:=]\s*["']([^"'\n]+)["']/i) ||
    originalContent.match(/["']?reason["']?\s*[:=]\s*["']?(.*?)["']?\s*[,}\n]/is);

  if (scoreMatch) {
    const score = Math.round(parseFloat(scoreMatch[1]));
    const reason = reasonMatch ? reasonMatch[1].trim().replace(/[\x00-\x1F\x7F]/g, '') : 'Score extracted from malformed response';
    console.log(`⚠️ [Job ${jobId || 'unknown'}] Parsed score via regex fallback: ${score}`);
    return { score, reason };
  }

  // Log the failure with full content for debugging
  console.error(`❌ [Job ${jobId || 'unknown'}] Failed to parse AI response. Raw content (first 500 chars):`,
    originalContent.substring(0, 500));
  console.error(`   Sanitized content (first 500 chars):`, sanitized.substring(0, 500));

  throw new Error('Unable to parse JSON from model response');
}

function buildScoringPrompt(job: Job, profile: Record<string, unknown>): string {
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
Location: ${job.location || 'Not specified'}
Salary: ${job.salary || 'Not specified'}
Degree Required: ${job.degreeRequired || 'Not specified'}
Disciplines: ${job.disciplines || 'Not specified'}

JOB DESCRIPTION:
${job.jobDescription || 'No description available'}

IMPORTANT: Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside the JSON.

REQUIRED FORMAT (exactly this structure):
{"score": <integer 0-100>, "reason": "<1-2 sentence explanation>"}

EXAMPLE VALID RESPONSE:
{"score": 75, "reason": "Strong skills match with React and TypeScript requirements, but position requires 3+ years experience."}`;
}


function mockScore(job: Job): SuitabilityResult {
  // Simple keyword-based scoring as fallback
  const jd = (job.jobDescription || '').toLowerCase();
  const title = job.title.toLowerCase();

  const goodKeywords = ['typescript', 'react', 'node', 'python', 'web', 'frontend', 'backend', 'fullstack', 'software', 'engineer', 'developer'];
  const badKeywords = ['senior', '5+ years', '10+ years', 'principal', 'staff', 'manager'];

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
    reason: 'Scored using keyword matching (API key not configured)',
  };
}

/**
 * Score multiple jobs and return sorted by score (descending).
 */
export async function scoreAndRankJobs(
  jobs: Job[],
  profile: Record<string, unknown>
): Promise<Array<Job & { suitabilityScore: number; suitabilityReason: string }>> {
  const scoredJobs = await Promise.all(
    jobs.map(async (job) => {
      const { score, reason } = await scoreJobSuitability(job, profile);
      return {
        ...job,
        suitabilityScore: score,
        suitabilityReason: reason,
      };
    })
  );

  return scoredJobs.sort((a, b) => b.suitabilityScore - a.suitabilityScore);
}
