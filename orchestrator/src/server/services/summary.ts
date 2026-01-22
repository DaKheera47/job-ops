/**
 * Service for generating tailored resume content (Summary, Headline, Skills).
 */

import { getSetting } from '../repositories/settings.js';
import { callOpenRouter, type JsonSchemaDefinition } from './openrouter.js';

export interface TailoredData {
  summary: string;
  headline: string;
  skills: Array<{ name: string; keywords: string[] }>;
}

export interface TailoringResult {
  success: boolean;
  data?: TailoredData;
  error?: string;
}

/** JSON schema for resume tailoring response */
const TAILORING_SCHEMA: JsonSchemaDefinition = {
  name: 'resume_tailoring',
  schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description: 'Job title headline matching the JD exactly',
      },
      summary: {
        type: 'string',
        description: 'Tailored resume summary paragraph',
      },
      skills: {
        type: 'array',
        description: 'Skills sections with keywords tailored to the job',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Skill category name (e.g., Frontend, Backend)',
            },
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of skills/technologies in this category',
            },
          },
          required: ['name', 'keywords'],
          additionalProperties: false,
        },
      },
    },
    required: ['headline', 'summary', 'skills'],
    additionalProperties: false,
  },
};

/**
 * Generate tailored resume content (summary, headline, skills) for a job.
 */
export async function generateTailoring(
  jobDescription: string,
  profile: Record<string, unknown>
): Promise<TailoringResult> {
  if (!process.env.OPENROUTER_API_KEY) {
    console.warn('⚠️ OPENROUTER_API_KEY not set, cannot generate tailoring');
    return { success: false, error: 'API key not configured' };
  }

  const [overrideModel, overrideModelTailoring] = await Promise.all([
    getSetting('model'),
    getSetting('modelTailoring'),
  ]);
  // Precedence: Tailoring-specific override > Global override > Env var > Default
  const model = overrideModelTailoring || overrideModel || process.env.MODEL || 'openai/gpt-4o-mini';
  const prompt = buildTailoringPrompt(profile, jobDescription);

  const result = await callOpenRouter<TailoredData>({
    model,
    messages: [{ role: 'user', content: prompt }],
    jsonSchema: TAILORING_SCHEMA,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  const { summary, headline, skills } = result.data;

  // Basic validation
  if (!summary || !headline || !Array.isArray(skills)) {
    console.warn('⚠️ AI response missing required fields:', result.data);
  }

  return {
    success: true,
    data: {
      summary: sanitizeText(summary || ''),
      headline: sanitizeText(headline || ''),
      skills: skills || []
    }
  };
}

/**
 * Backwards compatibility wrapper if needed, or alias.
 */
export async function generateSummary(
  jobDescription: string,
  profile: Record<string, unknown>
): Promise<{ success: boolean; summary?: string; error?: string }> {
  // If we just need summary, we can discard the rest (or cache it? but here we just return summary)
  const result = await generateTailoring(jobDescription, profile);
  return {
    success: result.success,
    summary: result.data?.summary,
    error: result.error
  };
}

function buildTailoringPrompt(profile: Record<string, unknown>, jd: string): string {
  // Extract only needed parts of profile to save tokens
  const relevantProfile = {
    basics: {
      name: (profile as any).basics?.name,
      label: (profile as any).basics?.label, // Original headline
      summary: (profile as any).basics?.summary,
    },
    skills: (profile as any).sections?.skills || (profile as any).skills,
    projects: (profile as any).sections?.projects?.items?.map((p: any) => ({
      name: p.name,
      description: p.description,
      keywords: p.keywords
    })),
    experience: (profile as any).sections?.experience?.items?.map((e: any) => ({
      company: e.company,
      position: e.position,
      summary: e.summary
    }))
  };

  return `
You are an expert resume writer tailoring a profile for a specific job application.
You must return a JSON object with three fields: "headline", "summary", and "skills".

JOB DESCRIPTION (JD):
${jd}

MY PROFILE:
${JSON.stringify(relevantProfile, null, 2)}

INSTRUCTIONS:

1. "headline" (String):
   - CRITICAL: This is the #1 ATS factor.
   - It must match the Job Title from the JD exactly (e.g., if JD says "Senior React Dev", use "Senior React Dev").
   - If the JD title is very generic, you may add one specialty, but keep it matching the role.

2. "summary" (String):
   - The Hook. This needs to mirror the company's "About You" / "What we're looking for" section.
   - Keep it concise, warm, and confident.
   - Do NOT invent experience.
   - Use the profile to add context.

3. "skills" (Array of Objects):
   - Review my existing skills section structure.
   - Keyword Stuffing: Swap synonyms to match the JD exactly (e.g. "TDD" -> "Unit Testing", "ReactJS" -> "React").
   - Keep my original skill levels and categories, just rename/reorder keywords to prioritize JD terms.
   - Return the full "items" array for the skills section, preserving the structure: { "name": "Frontend", "keywords": [...] }.

OUTPUT FORMAT (JSON):
{
  "headline": "...",
  "summary": "...",
  "skills": [ ... ]
}
`;
}

function sanitizeText(text: string): string {
  return text
    .replace(/\*\*[\s\S]*?\*\*/g, '') // remove markdown bold
    .trim();
}
