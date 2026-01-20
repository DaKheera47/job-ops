import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as jobsRepo from '../../repositories/jobs.js';
import * as settingsRepo from '../../repositories/settings.js';
import { processJob, summarizeJob, generateFinalPdf } from '../../pipeline/index.js';
import { createNotionEntry } from '../../services/notion.js';
import * as visaSponsors from '../../services/visa-sponsors/index.js';
import type { Job, JobStatus, ApiResponse, JobsListResponse } from '../../../shared/types.js';

export const jobsRouter = Router();

async function notifyJobCompleteWebhook(job: Job) {
  const overrideWebhookUrl = await settingsRepo.getSetting('jobCompleteWebhookUrl')
  const webhookUrl = (overrideWebhookUrl || process.env.JOB_COMPLETE_WEBHOOK_URL || '').trim()
  if (!webhookUrl) return

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const secret = process.env.WEBHOOK_SECRET
    if (secret) headers.Authorization = `Bearer ${secret}`

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: 'job.completed',
        sentAt: new Date().toISOString(),
        job,
      }),
    })

    if (!response.ok) {
      console.warn(`ƒsÿ‹,? Job complete webhook POST failed (${response.status}): ${await response.text()}`)
    }
  } catch (error) {
    console.warn('ƒsÿ‹,? Job complete webhook POST failed:', error)
  }
}

/**
 * PATCH /api/jobs/:id - Update a job
 */
const updateJobSchema = z.object({
  status: z.enum(['discovered', 'processing', 'ready', 'applied', 'skipped', 'expired']).optional(),
  jobDescription: z.string().optional(),
  suitabilityScore: z.number().min(0).max(100).optional(),
  suitabilityReason: z.string().optional(),
  tailoredSummary: z.string().optional(),
  selectedProjectIds: z.string().optional(),
  pdfPath: z.string().optional(),
  sponsorMatchScore: z.number().min(0).max(100).optional(),
  sponsorMatchNames: z.string().optional(),
});

/**
 * GET /api/jobs - List all jobs
 * Query params: status (comma-separated list of statuses to filter)
 */
jobsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const statusFilter = req.query.status as string | undefined;
    const statuses = statusFilter?.split(',').filter(Boolean) as JobStatus[] | undefined;

    const jobs = await jobsRepo.getAllJobs(statuses);
    const stats = await jobsRepo.getJobStats();

    const response: ApiResponse<JobsListResponse> = {
      success: true,
      data: {
        jobs,
        total: jobs.length,
        byStatus: stats,
      },
    };

    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/jobs/:id - Get a single job
 */
jobsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.getJobById(req.params.id);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

jobsRouter.patch('/:id', async (req: Request, res: Response) => {
  try {
    const input = updateJobSchema.parse(req.body);
    const job = await jobsRepo.updateJob(req.params.id, input);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/summarize - Generate AI summary and suggest projects
 */
jobsRouter.post('/:id/summarize', async (req: Request, res: Response) => {
  try {
    const forceRaw = req.query.force as string | undefined;
    const force = forceRaw === '1' || forceRaw === 'true';

    const result = await summarizeJob(req.params.id, { force });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const job = await jobsRepo.getJobById(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/check-sponsor - Check if employer is a visa sponsor
 */
jobsRouter.post('/:id/check-sponsor', async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.getJobById(req.params.id);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    if (!job.employer) {
      return res.status(400).json({ success: false, error: 'Job has no employer name' });
    }

    // Search for sponsor matches
    const sponsorResults = visaSponsors.searchSponsors(job.employer, {
      limit: 10,
      minScore: 50,
    });

    const { sponsorMatchScore, sponsorMatchNames } = visaSponsors.calculateSponsorMatchSummary(sponsorResults);

    // Update job with sponsor match info
    const updatedJob = await jobsRepo.updateJob(job.id, {
      sponsorMatchScore: sponsorMatchScore,
      sponsorMatchNames: sponsorMatchNames ?? undefined,
    });

    res.json({
      success: true,
      data: updatedJob,
      matchResults: sponsorResults.slice(0, 5).map(r => ({
        name: r.sponsor.organisationName,
        score: r.score,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/generate-pdf - Generate PDF using current manual overrides
 */
jobsRouter.post('/:id/generate-pdf', async (req: Request, res: Response) => {
  try {
    const result = await generateFinalPdf(req.params.id);

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const job = await jobsRepo.getJobById(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/process - Process a single job (generate summary + PDF)
 */
jobsRouter.post('/:id/process', async (req: Request, res: Response) => {
  try {
    const forceRaw = req.query.force as string | undefined;
    const force = forceRaw === '1' || forceRaw === 'true';

    const result = await processJob(req.params.id, { force });

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error });
    }

    const job = await jobsRepo.getJobById(req.params.id);
    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/apply - Mark a job as applied and sync to Notion
 */
jobsRouter.post('/:id/apply', async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.getJobById(req.params.id);

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    const appliedAt = new Date().toISOString();

    // Sync to Notion
    const notionResult = await createNotionEntry({
      id: job.id,
      title: job.title,
      employer: job.employer,
      applicationLink: job.applicationLink,
      deadline: job.deadline,
      salary: job.salary,
      location: job.location,
      pdfPath: job.pdfPath,
      appliedAt,
    });

    // Update job status
    const updatedJob = await jobsRepo.updateJob(job.id, {
      status: 'applied',
      appliedAt,
      notionPageId: notionResult.pageId,
    });

    if (updatedJob) {
      notifyJobCompleteWebhook(updatedJob).catch(console.warn)
    }

    res.json({ success: true, data: updatedJob });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/jobs/:id/skip - Mark a job as skipped
 */
jobsRouter.post('/:id/skip', async (req: Request, res: Response) => {
  try {
    const job = await jobsRepo.updateJob(req.params.id, { status: 'skipped' });

    if (!job) {
      return res.status(404).json({ success: false, error: 'Job not found' });
    }

    res.json({ success: true, data: job });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/jobs/status/:status - Clear jobs with a specific status
 */
jobsRouter.delete('/status/:status', async (req: Request, res: Response) => {
  try {
    const status = req.params.status as JobStatus;
    const count = await jobsRepo.deleteJobsByStatus(status);

    res.json({
      success: true,
      data: {
        message: `Cleared ${count} ${status} jobs`,
        count,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});
