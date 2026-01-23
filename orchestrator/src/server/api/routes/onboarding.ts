import { Router, Request, Response } from 'express';

import { resumeDataSchema } from '@shared/rxresume-schema.js';
import { RxResumeClient } from '@server/services/rxresume-client.js';
import { getSetting } from '@server/repositories/settings.js';
import { getResume, RxResumeCredentialsError } from '@server/services/rxresume-v4.js';

export const onboardingRouter = Router();

type ValidationResponse = {
  valid: boolean;
  message: string | null;
};

async function validateOpenrouter(apiKey?: string | null): Promise<ValidationResponse> {
  const key = apiKey?.trim() || process.env.OPENROUTER_API_KEY || '';
  if (!key) {
    return { valid: false, message: 'OpenRouter API key is missing.' };
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${key}`,
      },
    });

    if (!response.ok) {
      let detail = '';
      try {
        const payload = await response.json();
        if (payload && typeof payload === 'object' && 'error' in payload) {
          const errorObj = payload.error as { message?: string; code?: number | string };
          const message = errorObj?.message || '';
          const code = errorObj?.code ? ` (${errorObj.code})` : '';
          detail = `${message}${code}`.trim();
        }
      } catch {
        // ignore JSON parse errors
      }

      if (response.status === 401) {
        return { valid: false, message: 'Invalid OpenRouter API key. Check the key and try again.' };
      }

      const fallback = `OpenRouter returned ${response.status}`;
      return { valid: false, message: detail || fallback };
    }

    return { valid: true, message: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OpenRouter validation failed.';
    return { valid: false, message };
  }
}

/**
 * Validate that a base resume is configured and accessible via RxResume v4 API.
 */
async function validateResumeConfig(): Promise<ValidationResponse> {
  try {
    // Check if rxresumeBaseResumeId is configured
    const rxresumeBaseResumeId = await getSetting('rxresumeBaseResumeId');

    if (!rxresumeBaseResumeId) {
      return {
        valid: false,
        message: 'No base resume selected. Please select a resume from your RxResume account in Settings.'
      };
    }

    // Verify the resume is accessible and valid
    try {
      const resume = await getResume(rxresumeBaseResumeId);

      if (!resume.data || typeof resume.data !== 'object') {
        return { valid: false, message: 'Selected resume is empty or invalid.' };
      }

      // Validate against schema
      const result = resumeDataSchema.safeParse(resume.data);
      if (!result.success) {
        const issue = result.error.issues[0];
        const path = issue?.path?.join('.') || '';
        const baseMessage = issue?.message ?? 'Resume does not match the expected schema.';
        const details = path
          ? `Field "${path}": ${baseMessage}`
          : baseMessage;
        return { valid: false, message: details };
      }

      return { valid: true, message: null };
    } catch (error) {
      if (error instanceof RxResumeCredentialsError) {
        return { valid: false, message: 'RxResume credentials not configured.' };
      }
      const message = error instanceof Error ? error.message : 'Failed to fetch resume from RxResume.';
      return { valid: false, message };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Resume validation failed.';
    return { valid: false, message };
  }
}

async function validateRxresume(email?: string | null, password?: string | null): Promise<ValidationResponse> {
  const rxEmail = email?.trim() || process.env.RXRESUME_EMAIL || '';
  const rxPassword = password?.trim() || process.env.RXRESUME_PASSWORD || '';

  if (!rxEmail || !rxPassword) {
    return { valid: false, message: 'RxResume credentials are missing.' };
  }

  const result = await RxResumeClient.verifyCredentials(rxEmail, rxPassword);

  if (result.ok) {
    return { valid: true, message: null };
  }

  const normalizedMessage = result.message?.toLowerCase() ?? '';
  if (result.status === 401 || normalizedMessage.includes('invalidcredentials')) {
    return { valid: false, message: 'Invalid RxResume credentials. Check your email and password and try again.' };
  }

  const message = result.message || `RxResume validation failed (HTTP ${result.status})`;
  return { valid: false, message };
}

onboardingRouter.post('/validate/openrouter', async (req: Request, res: Response) => {
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey : undefined;
  const result = await validateOpenrouter(apiKey);
  res.json({ success: true, data: result });
});

onboardingRouter.post('/validate/rxresume', async (req: Request, res: Response) => {
  const email = typeof req.body?.email === 'string' ? req.body.email : undefined;
  const password = typeof req.body?.password === 'string' ? req.body.password : undefined;
  const result = await validateRxresume(email, password);
  res.json({ success: true, data: result });
});

onboardingRouter.get('/validate/resume', async (_req: Request, res: Response) => {
  const result = await validateResumeConfig();
  res.json({ success: true, data: result });
});
