/**
 * Service for inferring job details from a pasted job description.
 */

import { getSetting } from '../repositories/settings.js';
import type { ManualJobDraft } from '../../shared/types.js';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface ManualJobInferenceResult {
  job: ManualJobDraft;
  warning?: string | null;
}

export async function inferManualJobDetails(jobDescription: string): Promise<ManualJobInferenceResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    return {
      job: {},
      warning: 'OPENROUTER_API_KEY not set. Fill details manually.',
    };
  }

  const overrideModel = await getSetting('model');
  const model = overrideModel || process.env.MODEL || 'openai/gpt-4o-mini';
  const prompt = buildInferencePrompt(jobDescription);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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

    const parsed = parseJsonFromContent(content);
    return { job: normalizeDraft(parsed) };
  } catch (error) {
    console.warn('Manual job inference failed:', error);
    return {
      job: {},
      warning: 'AI inference failed. Fill details manually.',
    };
  }
}

function buildInferencePrompt(jd: string): string {
  return `
You are extracting structured data from a job description.
Return JSON only with the keys listed below. Use empty string if unknown.
Do not guess or invent data.

Keys:
- title
- employer
- location
- salary
- deadline
- jobUrl (the listing URL, if present)
- applicationLink (the apply URL, if present)
- jobType
- jobLevel
- jobFunction
- disciplines
- degreeRequired
- starting

JOB DESCRIPTION:
${jd}

OUTPUT FORMAT (JSON ONLY):
{
  "title": "",
  "employer": "",
  "location": "",
  "salary": "",
  "deadline": "",
  "jobUrl": "",
  "applicationLink": "",
  "jobType": "",
  "jobLevel": "",
  "jobFunction": "",
  "disciplines": "",
  "degreeRequired": "",
  "starting": ""
}
`.trim();
}

function parseJsonFromContent(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  const withoutFences = trimmed.replace(/```(?:json)?\s*|```/gi, '').trim();

  try {
    return JSON.parse(withoutFences);
  } catch {
    const firstBrace = withoutFences.indexOf('{');
    const lastBrace = withoutFences.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const sliced = withoutFences.slice(firstBrace, lastBrace + 1);
      return JSON.parse(sliced);
    }
    throw new Error('Unable to parse JSON from model response');
  }
}

function normalizeDraft(parsed: Record<string, unknown>): ManualJobDraft {
  const fields: Array<keyof ManualJobDraft> = [
    'title',
    'employer',
    'location',
    'salary',
    'deadline',
    'jobUrl',
    'applicationLink',
    'jobType',
    'jobLevel',
    'jobFunction',
    'disciplines',
    'degreeRequired',
    'starting',
  ];

  const out: ManualJobDraft = {};

  for (const field of fields) {
    const value = toCleanString(parsed[field]);
    if (value) out[field] = value;
  }

  return out;
}

function toCleanString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}
