import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import * as jobsRepo from '../../repositories/jobs.js';
import { inferManualJobDetails } from '../../services/manualJob.js';
import { scoreJobSuitability } from '../../services/scorer.js';
import { getProfile } from '../../services/profile.js';
import type { ApiResponse, ManualJobInferenceResponse } from '../../../shared/types.js';

export const manualJobsRouter = Router();

const manualJobInferenceSchema = z.object({
  jobDescription: z.string().trim().min(1).max(40000),
});

const manualJobImportSchema = z.object({
  job: z.object({
    title: z.string().trim().min(1).max(500),
    employer: z.string().trim().min(1).max(500),
    jobUrl: z.string().trim().url().max(2000).optional(),
    applicationLink: z.string().trim().url().max(2000).optional(),
    location: z.string().trim().max(200).optional(),
    salary: z.string().trim().max(200).optional(),
    deadline: z.string().trim().max(100).optional(),
    jobDescription: z.string().trim().min(1).max(40000),
    jobType: z.string().trim().max(200).optional(),
    jobLevel: z.string().trim().max(200).optional(),
    jobFunction: z.string().trim().max(200).optional(),
    disciplines: z.string().trim().max(200).optional(),
    degreeRequired: z.string().trim().max(200).optional(),
    starting: z.string().trim().max(200).optional(),
  }),
});

const cleanOptional = (value?: string | null) => {
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

/**
 * POST /api/manual-jobs/infer - Infer job details from a pasted description
 */
manualJobsRouter.post('/infer', async (req: Request, res: Response) => {
  try {
    const input = manualJobInferenceSchema.parse(req.body ?? {});
    const result = await inferManualJobDetails(input.jobDescription);

    const response: ApiResponse<ManualJobInferenceResponse> = {
      success: true,
      data: {
        job: result.job,
        warning: result.warning ?? null,
      },
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/manual-jobs/import - Import a manually curated job into the DB
 */
manualJobsRouter.post('/import', async (req: Request, res: Response) => {
  try {
    const input = manualJobImportSchema.parse(req.body ?? {});
    const job = input.job;

    const jobUrl =
      cleanOptional(job.jobUrl) ||
      cleanOptional(job.applicationLink) ||
      `manual://${randomUUID()}`;

    const createdJob = await jobsRepo.createJob({
      source: 'manual',
      title: job.title.trim(),
      employer: job.employer.trim(),
      jobUrl,
      applicationLink: cleanOptional(job.applicationLink) ?? undefined,
      location: cleanOptional(job.location) ?? undefined,
      salary: cleanOptional(job.salary) ?? undefined,
      deadline: cleanOptional(job.deadline) ?? undefined,
      jobDescription: job.jobDescription.trim(),
      jobType: cleanOptional(job.jobType) ?? undefined,
      jobLevel: cleanOptional(job.jobLevel) ?? undefined,
      jobFunction: cleanOptional(job.jobFunction) ?? undefined,
      disciplines: cleanOptional(job.disciplines) ?? undefined,
      degreeRequired: cleanOptional(job.degreeRequired) ?? undefined,
      starting: cleanOptional(job.starting) ?? undefined,
    });

    // Score asynchronously so the import returns immediately.
    (async () => {
      try {
        const rawProfile = await getProfile();
        if (!rawProfile || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
          throw new Error('Invalid resume profile format');
        }
        const profile = rawProfile as Record<string, unknown>;
        const { score, reason } = await scoreJobSuitability(createdJob, profile);
        await jobsRepo.updateJob(createdJob.id, {
          suitabilityScore: score,
          suitabilityReason: reason,
        });
      } catch (error) {
        console.warn('Manual job scoring failed:', error);
      }
    })().catch((error) => {
      console.warn('Manual job scoring task failed to start:', error);
    });

    res.json({ success: true, data: createdJob });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});
