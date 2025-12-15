/**
 * Service for scoring job suitability using AI.
 */

import type { Job } from '../../shared/types.js';
import { getSetting } from '../repositories/settings.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

interface SuitabilityResult {
  score: number;        // 0-100
  reason: string;       // Explanation
}

/**
 * Score a job's suitability based on profile and job description.
 */
export async function scoreJobSuitability(
  job: Job,
  profile: Record<string, unknown>
): Promise<SuitabilityResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('⚠️ OPENROUTER_API_KEY not set, using mock scoring');
    return mockScore(job);
  }

  const overrideModel = await getSetting('model');
  const model = overrideModel || process.env.MODEL || 'openai/gpt-4o-mini';
  
  const prompt = buildScoringPrompt(job, profile);
  
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost',
        'X-Title': 'JobOpsOrchestrator',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    
    if (!response.ok) {
      throw new Error(`OpenRouter error: ${response.status}`);
    }
    
    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in response');
    }
    
    const parsed = JSON.parse(content);
    return {
      score: Math.min(100, Math.max(0, parsed.score || 0)),
      reason: parsed.reason || 'No explanation provided',
    };
  } catch (error) {
    console.error('Failed to score job:', error);
    return mockScore(job);
  }
}

function buildScoringPrompt(job: Job, profile: Record<string, unknown>): string {
  return `
You are evaluating a job listing for a candidate. Score how suitable this job is for the candidate on a scale of 0-100.

Consider:
- Skills match (technologies, frameworks, languages)
- Experience level match
- Location/remote work alignment
- Industry/domain fit
- Career growth potential

Candidate Profile:
${JSON.stringify(profile, null, 2)}

Job Listing:
Title: ${job.title}
Employer: ${job.employer}
Location: ${job.location || 'Not specified'}
Salary: ${job.salary || 'Not specified'}
Degree Required: ${job.degreeRequired || 'Not specified'}
Disciplines: ${job.disciplines || 'Not specified'}

Job Description:
${job.jobDescription || 'No description available'}

Respond with JSON: { "score": <0-100>, "reason": "<brief explanation>" }
`;
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
