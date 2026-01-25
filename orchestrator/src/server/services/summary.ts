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
        description: 'Updated keywords for each skill category (matched by name)',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'The name of the skill category from the profile (e.g., "Frontend", "Backend & Tools")',
            },
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'Updated list of skills/technologies - reworded to match JD terminology',
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
  const model = overrideModelTailoring || overrideModel || process.env.MODEL || 'google/gemini-3-flash-preview';
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
  // Extract skills with their IDs for the AI to reference
  const skillItems = (profile as any).sections?.skills?.items || (profile as any).skills?.items || [];
  const skillsForPrompt = skillItems.map((s: any) => ({
    id: s.id,
    name: s.name,
    keywords: s.keywords
  }));

  // Extract only needed parts of profile to save tokens
  const relevantProfile = {
    basics: {
      name: (profile as any).basics?.name,
      label: (profile as any).basics?.label, // Original headline
      summary: (profile as any).basics?.summary,
    },
    skills: skillsForPrompt,
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
   - For EACH skill category in my profile, return an object with the category "name" and updated "keywords".
   - Use the EXACT category name from my profile (e.g., "Frontend", "Backend & Tools").
   - ONLY include keywords that ALREADY EXIST in my profile. Do NOT add ANY new skills.
   - Your job is ONLY to reword/rename existing keywords to match JD terminology (e.g., "React" -> "React.js").
   - You may reorder keywords to prioritize terms mentioned in the JD.
   - FORBIDDEN: Adding skills I don't have (e.g., if JD wants "Ruby on Rails" but I don't have it, do NOT add it).
   - The output keywords must be a subset or renaming of my input keywords - nothing new.

OUTPUT FORMAT (JSON):
{
  "headline": "...",
  "summary": "...",
  "skills": [
    { "name": "Frontend", "keywords": ["Keyword1", "Keyword2", ...] },
    ...
  ]
}
`;
}

function sanitizeText(text: string): string {
  return text
    .replace(/\*\*[\s\S]*?\*\*/g, '') // remove markdown bold
    .trim();
}
