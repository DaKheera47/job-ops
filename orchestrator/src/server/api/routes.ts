/**
 * API routes for the orchestrator.
 */

import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import * as jobsRepo from '../repositories/jobs.js';
import * as pipelineRepo from '../repositories/pipeline.js';
import * as settingsRepo from '../repositories/settings.js';
import { runPipeline, processJob, summarizeJob, generateFinalPdf, getPipelineStatus, subscribeToProgress, getProgress } from '../pipeline/index.js';
import { createNotionEntry } from '../services/notion.js';
import { fetchUkVisaJobsPage } from '../services/ukvisajobs.js';
import { inferManualJobDetails } from '../services/manualJob.js';
import { clearDatabase } from '../db/clear.js';
import {
  extractProjectsFromProfile,
  loadResumeProfile,
  normalizeResumeProjectsSettings,
  resolveResumeProjectsSettings,
} from '../services/resumeProjects.js';
import * as visaSponsors from '../services/visa-sponsors/index.js';
import type {
  Job,
  JobStatus,
  ApiResponse,
  JobsListResponse,
  PipelineStatusResponse,
  UkVisaJobsSearchResponse,
  UkVisaJobsImportResponse,
  VisaSponsorSearchResponse,
  VisaSponsorStatusResponse,
  ManualJobInferenceResponse,
} from '../../shared/types.js';

export const apiRouter = Router();
let isUkVisaJobsSearchRunning = false;

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
      console.warn(`⚠️ Job complete webhook POST failed (${response.status}): ${await response.text()}`)
    }
  } catch (error) {
    console.warn('⚠️ Job complete webhook POST failed:', error)
  }
}

// ============================================================================
// Jobs API
// ============================================================================

/**
 * GET /api/jobs - List all jobs
 * Query params: status (comma-separated list of statuses to filter)
 */
apiRouter.get('/jobs', async (req: Request, res: Response) => {
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
apiRouter.get('/jobs/:id', async (req: Request, res: Response) => {
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
});

apiRouter.patch('/jobs/:id', async (req: Request, res: Response) => {
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
apiRouter.post('/jobs/:id/summarize', async (req: Request, res: Response) => {
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
 * POST /api/jobs/:id/generate-pdf - Generate PDF using current manual overrides
 */
apiRouter.post('/jobs/:id/generate-pdf', async (req: Request, res: Response) => {
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
apiRouter.post('/jobs/:id/process', async (req: Request, res: Response) => {
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
apiRouter.post('/jobs/:id/apply', async (req: Request, res: Response) => {
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
apiRouter.post('/jobs/:id/skip', async (req: Request, res: Response) => {
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

// ============================================================================
// Pipeline API
// ============================================================================

/**
 * GET /api/settings - Get app settings (effective + defaults)
 */
apiRouter.get('/settings', async (_req: Request, res: Response) => {
  try {
    const overrideModel = await settingsRepo.getSetting('model');
    const defaultModel = process.env.MODEL || 'openai/gpt-4o-mini';
    const model = overrideModel || defaultModel;

    // Specific AI models
    const overrideModelScorer = await settingsRepo.getSetting('modelScorer');
    const modelScorer = overrideModelScorer || model; 

    const overrideModelTailoring = await settingsRepo.getSetting('modelTailoring');
    const modelTailoring = overrideModelTailoring || model; 

    const overrideModelProjectSelection = await settingsRepo.getSetting('modelProjectSelection');
    const modelProjectSelection = overrideModelProjectSelection || model; 

    const overridePipelineWebhookUrl = await settingsRepo.getSetting('pipelineWebhookUrl');
    const defaultPipelineWebhookUrl = process.env.PIPELINE_WEBHOOK_URL || process.env.WEBHOOK_URL || '';
    const pipelineWebhookUrl = overridePipelineWebhookUrl || defaultPipelineWebhookUrl;

    const overrideJobCompleteWebhookUrl = await settingsRepo.getSetting('jobCompleteWebhookUrl');
    const defaultJobCompleteWebhookUrl = process.env.JOB_COMPLETE_WEBHOOK_URL || '';
    const jobCompleteWebhookUrl = overrideJobCompleteWebhookUrl || defaultJobCompleteWebhookUrl;

    const profile = await loadResumeProfile();
    const { catalog } = extractProjectsFromProfile(profile);
    const overrideResumeProjectsRaw = await settingsRepo.getSetting('resumeProjects');
    const resumeProjectsData = resolveResumeProjectsSettings({ catalog, overrideRaw: overrideResumeProjectsRaw });

    const overrideUkvisajobsMaxJobsRaw = await settingsRepo.getSetting('ukvisajobsMaxJobs');
    const defaultUkvisajobsMaxJobs = 50;
    const overrideUkvisajobsMaxJobs = overrideUkvisajobsMaxJobsRaw ? parseInt(overrideUkvisajobsMaxJobsRaw, 10) : null;
    const ukvisajobsMaxJobs = overrideUkvisajobsMaxJobs ?? defaultUkvisajobsMaxJobs;

    const overrideGradcrackerMaxJobsPerTermRaw = await settingsRepo.getSetting('gradcrackerMaxJobsPerTerm');
    const defaultGradcrackerMaxJobsPerTerm = 50;
    const overrideGradcrackerMaxJobsPerTerm = overrideGradcrackerMaxJobsPerTermRaw ? parseInt(overrideGradcrackerMaxJobsPerTermRaw, 10) : null;
    const gradcrackerMaxJobsPerTerm = overrideGradcrackerMaxJobsPerTerm ?? defaultGradcrackerMaxJobsPerTerm;

    const overrideSearchTermsRaw = await settingsRepo.getSetting('searchTerms');
    const defaultSearchTermsEnv = process.env.JOBSPY_SEARCH_TERMS || 'web developer';
    const defaultSearchTerms = defaultSearchTermsEnv.split('|').map(s => s.trim()).filter(Boolean);
    const overrideSearchTerms = overrideSearchTermsRaw ? JSON.parse(overrideSearchTermsRaw) as string[] : null;
    const searchTerms = overrideSearchTerms ?? defaultSearchTerms;

    // JobSpy settings (GET)
    const overrideJobspyLocation = await settingsRepo.getSetting('jobspyLocation');
    const defaultJobspyLocation = process.env.JOBSPY_LOCATION || 'UK';
    const jobspyLocation = overrideJobspyLocation || defaultJobspyLocation;

    const overrideJobspyResultsWantedRaw = await settingsRepo.getSetting('jobspyResultsWanted');
    const defaultJobspyResultsWanted = parseInt(process.env.JOBSPY_RESULTS_WANTED || '200', 10);
    const overrideJobspyResultsWanted = overrideJobspyResultsWantedRaw ? parseInt(overrideJobspyResultsWantedRaw, 10) : null;
    const jobspyResultsWanted = overrideJobspyResultsWanted ?? defaultJobspyResultsWanted;

    const overrideJobspyHoursOldRaw = await settingsRepo.getSetting('jobspyHoursOld');
    const defaultJobspyHoursOld = parseInt(process.env.JOBSPY_HOURS_OLD || '72', 10);
    const overrideJobspyHoursOld = overrideJobspyHoursOldRaw ? parseInt(overrideJobspyHoursOldRaw, 10) : null;
    const jobspyHoursOld = overrideJobspyHoursOld ?? defaultJobspyHoursOld;

    const overrideJobspyCountryIndeed = await settingsRepo.getSetting('jobspyCountryIndeed');
    const defaultJobspyCountryIndeed = process.env.JOBSPY_COUNTRY_INDEED || 'UK';
    const jobspyCountryIndeed = overrideJobspyCountryIndeed || defaultJobspyCountryIndeed;

    const overrideJobspySitesRaw = await settingsRepo.getSetting('jobspySites');
    const defaultJobspySites = (process.env.JOBSPY_SITES || 'indeed,linkedin').split(',').map(s => s.trim()).filter(Boolean);
    const overrideJobspySites = overrideJobspySitesRaw ? JSON.parse(overrideJobspySitesRaw) as string[] : null;
    const jobspySites = overrideJobspySites ?? defaultJobspySites;

    const overrideJobspyLinkedinFetchDescriptionRaw = await settingsRepo.getSetting('jobspyLinkedinFetchDescription');
    const defaultJobspyLinkedinFetchDescription = (process.env.JOBSPY_LINKEDIN_FETCH_DESCRIPTION || '1') === '1';
    const overrideJobspyLinkedinFetchDescription = overrideJobspyLinkedinFetchDescriptionRaw
      ? overrideJobspyLinkedinFetchDescriptionRaw === 'true' || overrideJobspyLinkedinFetchDescriptionRaw === '1'
      : null;
    const jobspyLinkedinFetchDescription = overrideJobspyLinkedinFetchDescription ?? defaultJobspyLinkedinFetchDescription;

    res.json({
      success: true,
      data: {
        model,
        defaultModel,
        overrideModel,
        modelScorer,
        overrideModelScorer,
        modelTailoring,
        overrideModelTailoring,
        modelProjectSelection,
        overrideModelProjectSelection,
        pipelineWebhookUrl,
        defaultPipelineWebhookUrl,
        overridePipelineWebhookUrl,
        jobCompleteWebhookUrl,
        defaultJobCompleteWebhookUrl,
        overrideJobCompleteWebhookUrl,
        ...resumeProjectsData,
        ukvisajobsMaxJobs,
        defaultUkvisajobsMaxJobs,
        overrideUkvisajobsMaxJobs,
        gradcrackerMaxJobsPerTerm,
        defaultGradcrackerMaxJobsPerTerm,
        overrideGradcrackerMaxJobsPerTerm,
        searchTerms,
        defaultSearchTerms,
        overrideSearchTerms,
        jobspyLocation,
        defaultJobspyLocation,
        overrideJobspyLocation,
        jobspyResultsWanted,
        defaultJobspyResultsWanted,
        overrideJobspyResultsWanted,
        jobspyHoursOld,
        defaultJobspyHoursOld,
        overrideJobspyHoursOld,
        jobspyCountryIndeed,
        defaultJobspyCountryIndeed,
        overrideJobspyCountryIndeed,
        jobspySites,
        defaultJobspySites,
        overrideJobspySites,
        jobspyLinkedinFetchDescription,
        defaultJobspyLinkedinFetchDescription,
        overrideJobspyLinkedinFetchDescription,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

const updateSettingsSchema = z.object({
  model: z.string().trim().min(1).max(200).nullable().optional(),
  modelScorer: z.string().trim().min(1).max(200).nullable().optional(),
  modelTailoring: z.string().trim().min(1).max(200).nullable().optional(),
  modelProjectSelection: z.string().trim().min(1).max(200).nullable().optional(),
  pipelineWebhookUrl: z.string().trim().min(1).max(2000).nullable().optional(),
  jobCompleteWebhookUrl: z.string().trim().min(1).max(2000).nullable().optional(),
  resumeProjects: z.object({
    maxProjects: z.number().int().min(0).max(50),
    lockedProjectIds: z.array(z.string().trim().min(1)).max(200),
    aiSelectableProjectIds: z.array(z.string().trim().min(1)).max(200),
  }).nullable().optional(),
  ukvisajobsMaxJobs: z.number().int().min(1).max(200).nullable().optional(),
  gradcrackerMaxJobsPerTerm: z.number().int().min(1).max(200).nullable().optional(),
  searchTerms: z.array(z.string().trim().min(1).max(200)).max(50).nullable().optional(),
  jobspyLocation: z.string().trim().min(1).max(100).nullable().optional(),
  jobspyResultsWanted: z.number().int().min(1).max(500).nullable().optional(),
  jobspyHoursOld: z.number().int().min(1).max(168).nullable().optional(),
  jobspyCountryIndeed: z.string().trim().min(1).max(100).nullable().optional(),
  jobspySites: z.array(z.string().trim().min(1).max(50)).max(10).nullable().optional(),
  jobspyLinkedinFetchDescription: z.boolean().nullable().optional(),
});

/**
 * PATCH /api/settings - Update settings overrides
 */
apiRouter.patch('/settings', async (req: Request, res: Response) => {
  try {
    const input = updateSettingsSchema.parse(req.body);

    if ('model' in input) {
      const model = input.model ?? null;
      await settingsRepo.setSetting('model', model);
    }

    if ('modelScorer' in input) {
      await settingsRepo.setSetting('modelScorer', input.modelScorer ?? null);
    }
    if ('modelTailoring' in input) {
      await settingsRepo.setSetting('modelTailoring', input.modelTailoring ?? null);
    }
    if ('modelProjectSelection' in input) {
      await settingsRepo.setSetting('modelProjectSelection', input.modelProjectSelection ?? null);
    }

    if ('pipelineWebhookUrl' in input) {
      const pipelineWebhookUrl = input.pipelineWebhookUrl ?? null;
      await settingsRepo.setSetting('pipelineWebhookUrl', pipelineWebhookUrl);
    }

    if ('jobCompleteWebhookUrl' in input) {
      const webhookUrl = input.jobCompleteWebhookUrl ?? null;
      await settingsRepo.setSetting('jobCompleteWebhookUrl', webhookUrl);
    }

    if ('resumeProjects' in input) {
      const resumeProjects = input.resumeProjects ?? null;

      if (resumeProjects === null) {
        await settingsRepo.setSetting('resumeProjects', null);
      } else {
        const profile = await loadResumeProfile();
        const { catalog } = extractProjectsFromProfile(profile);
        const allowed = new Set(catalog.map((p) => p.id));
        const normalized = normalizeResumeProjectsSettings(resumeProjects, allowed);
        await settingsRepo.setSetting('resumeProjects', JSON.stringify(normalized));
      }
    }

    if ('ukvisajobsMaxJobs' in input) {
      const ukvisajobsMaxJobs = input.ukvisajobsMaxJobs ?? null;
      await settingsRepo.setSetting('ukvisajobsMaxJobs', ukvisajobsMaxJobs !== null ? String(ukvisajobsMaxJobs) : null);
    }

    if ('gradcrackerMaxJobsPerTerm' in input) {
      const gradcrackerMaxJobsPerTerm = input.gradcrackerMaxJobsPerTerm ?? null;
      await settingsRepo.setSetting('gradcrackerMaxJobsPerTerm', gradcrackerMaxJobsPerTerm !== null ? String(gradcrackerMaxJobsPerTerm) : null);
    }

    if ('searchTerms' in input) {
      const searchTerms = input.searchTerms ?? null;
      await settingsRepo.setSetting('searchTerms', searchTerms !== null ? JSON.stringify(searchTerms) : null);
    }

    if ('jobspyLocation' in input) {
      const value = input.jobspyLocation ?? null;
      await settingsRepo.setSetting('jobspyLocation', value);
    }

    if ('jobspyResultsWanted' in input) {
      const value = input.jobspyResultsWanted ?? null;
      await settingsRepo.setSetting('jobspyResultsWanted', value !== null ? String(value) : null);
    }

    if ('jobspyHoursOld' in input) {
      const value = input.jobspyHoursOld ?? null;
      await settingsRepo.setSetting('jobspyHoursOld', value !== null ? String(value) : null);
    }

    if ('jobspyCountryIndeed' in input) {
      const value = input.jobspyCountryIndeed ?? null;
      await settingsRepo.setSetting('jobspyCountryIndeed', value);
    }

    if ('jobspySites' in input) {
      const value = input.jobspySites ?? null;
      await settingsRepo.setSetting('jobspySites', value !== null ? JSON.stringify(value) : null);
    }

    if ('jobspyLinkedinFetchDescription' in input) {
      const value = input.jobspyLinkedinFetchDescription ?? null;
      await settingsRepo.setSetting('jobspyLinkedinFetchDescription', value !== null ? (value ? '1' : '0') : null);
    }

    const overrideModel = await settingsRepo.getSetting('model');
    const defaultModel = process.env.MODEL || 'openai/gpt-4o-mini';
    const model = overrideModel || defaultModel;

    const overrideModelScorer = await settingsRepo.getSetting('modelScorer');
    const modelScorer = overrideModelScorer || model; 

    const overrideModelTailoring = await settingsRepo.getSetting('modelTailoring');
    const modelTailoring = overrideModelTailoring || model; 

    const overrideModelProjectSelection = await settingsRepo.getSetting('modelProjectSelection');
    const modelProjectSelection = overrideModelProjectSelection || model;

    const overridePipelineWebhookUrl = await settingsRepo.getSetting('pipelineWebhookUrl');
    const defaultPipelineWebhookUrl = process.env.PIPELINE_WEBHOOK_URL || process.env.WEBHOOK_URL || '';
    const pipelineWebhookUrl = overridePipelineWebhookUrl || defaultPipelineWebhookUrl;

    const overrideJobCompleteWebhookUrl = await settingsRepo.getSetting('jobCompleteWebhookUrl');
    const defaultJobCompleteWebhookUrl = process.env.JOB_COMPLETE_WEBHOOK_URL || '';
    const jobCompleteWebhookUrl = overrideJobCompleteWebhookUrl || defaultJobCompleteWebhookUrl;

    const profile = await loadResumeProfile();
    const { catalog } = extractProjectsFromProfile(profile);
    const overrideResumeProjectsRaw = await settingsRepo.getSetting('resumeProjects');
    const resumeProjectsData = resolveResumeProjectsSettings({ catalog, overrideRaw: overrideResumeProjectsRaw });

    const overrideUkvisajobsMaxJobsRaw = await settingsRepo.getSetting('ukvisajobsMaxJobs');
    const defaultUkvisajobsMaxJobs = 50;
    const overrideUkvisajobsMaxJobs = overrideUkvisajobsMaxJobsRaw ? parseInt(overrideUkvisajobsMaxJobsRaw, 10) : null;
    const ukvisajobsMaxJobs = overrideUkvisajobsMaxJobs ?? defaultUkvisajobsMaxJobs;

    const overrideGradcrackerMaxJobsPerTermRaw = await settingsRepo.getSetting('gradcrackerMaxJobsPerTerm');
    const defaultGradcrackerMaxJobsPerTerm = 50;
    const overrideGradcrackerMaxJobsPerTerm = overrideGradcrackerMaxJobsPerTermRaw ? parseInt(overrideGradcrackerMaxJobsPerTermRaw, 10) : null;
    const gradcrackerMaxJobsPerTerm = overrideGradcrackerMaxJobsPerTerm ?? defaultGradcrackerMaxJobsPerTerm;

    // Search terms - stored as JSON array, default from env var (pipe-separated)
    const overrideSearchTermsRaw = await settingsRepo.getSetting('searchTerms');
    const defaultSearchTermsEnv = process.env.JOBSPY_SEARCH_TERMS || 'web developer';
    const defaultSearchTerms = defaultSearchTermsEnv.split('|').map(s => s.trim()).filter(Boolean);
    const overrideSearchTerms = overrideSearchTermsRaw ? JSON.parse(overrideSearchTermsRaw) as string[] : null;
    const searchTerms = overrideSearchTerms ?? defaultSearchTerms;

    // JobSpy settings (re-fetch to update response)
    const overrideJobspyLocation = await settingsRepo.getSetting('jobspyLocation');
    const defaultJobspyLocation = process.env.JOBSPY_LOCATION || 'UK';
    const jobspyLocation = overrideJobspyLocation || defaultJobspyLocation;

    const overrideJobspyResultsWantedRaw = await settingsRepo.getSetting('jobspyResultsWanted');
    const defaultJobspyResultsWanted = parseInt(process.env.JOBSPY_RESULTS_WANTED || '200', 10);
    const overrideJobspyResultsWanted = overrideJobspyResultsWantedRaw ? parseInt(overrideJobspyResultsWantedRaw, 10) : null;
    const jobspyResultsWanted = overrideJobspyResultsWanted ?? defaultJobspyResultsWanted;

    const overrideJobspyHoursOldRaw = await settingsRepo.getSetting('jobspyHoursOld');
    const defaultJobspyHoursOld = parseInt(process.env.JOBSPY_HOURS_OLD || '72', 10);
    const overrideJobspyHoursOld = overrideJobspyHoursOldRaw ? parseInt(overrideJobspyHoursOldRaw, 10) : null;
    const jobspyHoursOld = overrideJobspyHoursOld ?? defaultJobspyHoursOld;

    const overrideJobspyCountryIndeed = await settingsRepo.getSetting('jobspyCountryIndeed');
    const defaultJobspyCountryIndeed = process.env.JOBSPY_COUNTRY_INDEED || 'UK';
    const jobspyCountryIndeed = overrideJobspyCountryIndeed || defaultJobspyCountryIndeed;

    const overrideJobspySitesRaw = await settingsRepo.getSetting('jobspySites');
    const defaultJobspySites = (process.env.JOBSPY_SITES || 'indeed,linkedin').split(',').map(s => s.trim()).filter(Boolean);
    const overrideJobspySites = overrideJobspySitesRaw ? JSON.parse(overrideJobspySitesRaw) as string[] : null;
    const jobspySites = overrideJobspySites ?? defaultJobspySites;

    const overrideJobspyLinkedinFetchDescriptionRaw = await settingsRepo.getSetting('jobspyLinkedinFetchDescription');
    const defaultJobspyLinkedinFetchDescription = (process.env.JOBSPY_LINKEDIN_FETCH_DESCRIPTION || '1') === '1';
    const overrideJobspyLinkedinFetchDescription = overrideJobspyLinkedinFetchDescriptionRaw
      ? overrideJobspyLinkedinFetchDescriptionRaw === 'true' || overrideJobspyLinkedinFetchDescriptionRaw === '1'
      : null;
    const jobspyLinkedinFetchDescription = overrideJobspyLinkedinFetchDescription ?? defaultJobspyLinkedinFetchDescription;

    res.json({
      success: true,
      data: {
        model,
        defaultModel,
        overrideModel,
        modelScorer,
        overrideModelScorer,
        modelTailoring,
        overrideModelTailoring,
        modelProjectSelection,
        overrideModelProjectSelection,
        pipelineWebhookUrl,
        defaultPipelineWebhookUrl,
        overridePipelineWebhookUrl,
        jobCompleteWebhookUrl,
        defaultJobCompleteWebhookUrl,
        overrideJobCompleteWebhookUrl,
        ...resumeProjectsData,
        ukvisajobsMaxJobs,
        defaultUkvisajobsMaxJobs,
        overrideUkvisajobsMaxJobs,
        gradcrackerMaxJobsPerTerm,
        defaultGradcrackerMaxJobsPerTerm,
        overrideGradcrackerMaxJobsPerTerm,
        searchTerms,
        defaultSearchTerms,
        overrideSearchTerms,
        jobspyLocation,
        defaultJobspyLocation,
        overrideJobspyLocation,
        jobspyResultsWanted,
        defaultJobspyResultsWanted,
        overrideJobspyResultsWanted,
        jobspyHoursOld,
        defaultJobspyHoursOld,
        overrideJobspyHoursOld,
        jobspyCountryIndeed,
        defaultJobspyCountryIndeed,
        overrideJobspyCountryIndeed,
        jobspySites,
        defaultJobspySites,
        overrideJobspySites,
        jobspyLinkedinFetchDescription,
        defaultJobspyLinkedinFetchDescription,
        overrideJobspyLinkedinFetchDescription,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // PATCH usually returns 500 for unknown, but let's stick to what was there (400?)
    // Wait, the file said 400? Let's verify line 608.
    res.status(400).json({ success: false, error: message });
  }
});

/**
 * GET /api/pipeline/status - Get pipeline status
 */
apiRouter.get('/pipeline/status', async (req: Request, res: Response) => {
  try {
    const { isRunning } = getPipelineStatus();
    const lastRun = await pipelineRepo.getLatestPipelineRun();

    const response: ApiResponse<PipelineStatusResponse> = {
      success: true,
      data: {
        isRunning,
        lastRun,
        nextScheduledRun: null, // Would come from n8n
      },
    };

    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /api/pipeline/progress - Server-Sent Events endpoint for live progress
 */
apiRouter.get('/pipeline/progress', (req: Request, res: Response) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering

  // Send initial progress
  const sendProgress = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Subscribe to progress updates
  const unsubscribe = subscribeToProgress(sendProgress);

  // Send heartbeat every 30 seconds to keep connection alive
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

/**
 * GET /api/pipeline/runs - Get recent pipeline runs
 */
apiRouter.get('/pipeline/runs', async (req: Request, res: Response) => {
  try {
    const runs = await pipelineRepo.getRecentPipelineRuns(20);
    res.json({ success: true, data: runs });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/pipeline/run - Trigger the pipeline manually
 */
const runPipelineSchema = z.object({
  topN: z.number().min(1).max(50).optional(),
  minSuitabilityScore: z.number().min(0).max(100).optional(),
  sources: z.array(z.enum(['gradcracker', 'indeed', 'linkedin', 'ukvisajobs'])).min(1).optional(),
});

apiRouter.post('/pipeline/run', async (req: Request, res: Response) => {
  try {
    const config = runPipelineSchema.parse(req.body);

    // Start pipeline in background
    runPipeline(config).catch(console.error);

    res.json({
      success: true,
      data: { message: 'Pipeline started' }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// ============================================================================
// Manual Job Import API
// ============================================================================

const manualJobInferenceSchema = z.object({
  jobDescription: z.string().trim().min(1).max(40000),
});

const manualJobImportSchema = z.object({
  job: z.object({
    title: z.string().trim().min(1).max(500),
    employer: z.string().trim().min(1).max(500),
    jobUrl: z.string().trim().max(2000).optional(),
    applicationLink: z.string().trim().max(2000).optional(),
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
apiRouter.post('/manual-jobs/infer', async (req: Request, res: Response) => {
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
apiRouter.post('/manual-jobs/import', async (req: Request, res: Response) => {
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

    res.json({ success: true, data: createdJob });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// ============================================================================
// UK Visa Jobs API
// ============================================================================

const ukVisaJobsSearchSchema = z.object({
  query: z.string().trim().min(1).max(200).optional(),
  searchTerm: z.string().trim().min(1).max(200).optional(),
  searchTerms: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  page: z.number().int().min(1).optional(),
});

/**
 * POST /api/ukvisajobs/search - Run a UKVisaJobs search without importing into the DB
 */
apiRouter.post('/ukvisajobs/search', async (req: Request, res: Response) => {
  let lockAcquired = false;

  try {
    const input = ukVisaJobsSearchSchema.parse(req.body ?? {});

    if (isUkVisaJobsSearchRunning) {
      return res.status(409).json({ success: false, error: 'UK Visa Jobs search is already running' });
    }

    const { isRunning } = getPipelineStatus();
    if (isRunning) {
      return res.status(409).json({ success: false, error: 'Pipeline is running. Stop it before running UK Visa Jobs search.' });
    }

    isUkVisaJobsSearchRunning = true;
    lockAcquired = true;

    const rawTerms = input.searchTerms ?? [];
    if (rawTerms.length > 1) {
      return res.status(400).json({ success: false, error: 'Pagination supports a single search term.' });
    }

    const searchTerm = input.searchTerm ?? input.query ?? rawTerms[0];
    const page = input.page ?? 1;

    const result = await fetchUkVisaJobsPage({
      searchKeyword: searchTerm,
      page,
    });

    const totalPages = Math.max(1, Math.ceil(result.totalJobs / result.pageSize));

    const response: ApiResponse<UkVisaJobsSearchResponse> = {
      success: true,
      data: {
        jobs: result.jobs,
        totalJobs: result.totalJobs,
        page: result.page,
        pageSize: result.pageSize,
        totalPages,
      },
    };

    res.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  } finally {
    if (lockAcquired) {
      isUkVisaJobsSearchRunning = false;
    }
  }
});

const ukVisaJobsImportSchema = z.object({
  jobs: z.array(z.object({
    title: z.string().trim().min(1).max(500),
    employer: z.string().trim().min(1).max(500),
    jobUrl: z.string().trim().min(1).max(2000),
    sourceJobId: z.string().trim().min(1).max(200).optional(),
    employerUrl: z.string().trim().min(1).max(2000).optional(),
    applicationLink: z.string().trim().min(1).max(2000).optional(),
    location: z.string().trim().max(200).optional(),
    deadline: z.string().trim().max(100).optional(),
    salary: z.string().trim().max(200).optional(),
    jobDescription: z.string().trim().max(20000).optional(),
    datePosted: z.string().trim().max(100).optional(),
    degreeRequired: z.string().trim().max(200).optional(),
    jobType: z.string().trim().max(200).optional(),
    jobLevel: z.string().trim().max(200).optional(),
  })).min(1).max(200),
});

/**
 * POST /api/ukvisajobs/import - Import selected UKVisaJobs results into the DB
 */
apiRouter.post('/ukvisajobs/import', async (req: Request, res: Response) => {
  try {
    const input = ukVisaJobsImportSchema.parse(req.body ?? {});

    const jobs = input.jobs.map((job) => ({
      ...job,
      source: 'ukvisajobs' as const,
    }));

    const result = await jobsRepo.bulkCreateJobs(jobs);

    const response: ApiResponse<UkVisaJobsImportResponse> = {
      success: true,
      data: {
        created: result.created,
        skipped: result.skipped,
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

// ============================================================================
// Webhook for n8n
// ============================================================================

/**
 * POST /api/webhook/trigger - Webhook endpoint for n8n to trigger the pipeline
 */
apiRouter.post('/webhook/trigger', async (req: Request, res: Response) => {
  // Optional: Add authentication check
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.WEBHOOK_SECRET;

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    // Start pipeline in background
    runPipeline().catch(console.error);

    res.json({
      success: true,
      data: {
        message: 'Pipeline triggered',
        triggeredAt: new Date().toISOString(),
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * DELETE /api/jobs/status/:status - Clear jobs with a specific status
 */
apiRouter.delete('/jobs/status/:status', async (req: Request, res: Response) => {
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

/**
 * GET /api/profile/projects - Get all projects available in the base resume
 */
apiRouter.get('/profile/projects', async (req: Request, res: Response) => {
  try {
    const profile = await loadResumeProfile();
    const { catalog } = extractProjectsFromProfile(profile);
    res.json({ success: true, data: catalog });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});


// ============================================================================
// Database Management
// ============================================================================

/**
 * DELETE /api/database - Clear all data from the database
 */
apiRouter.delete('/database', async (req: Request, res: Response) => {
  try {
    const result = clearDatabase();

    res.json({
      success: true,
      data: {
        message: 'Database cleared',
        jobsDeleted: result.jobsDeleted,
        runsDeleted: result.runsDeleted,
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

// ============================================================================
// Visa Sponsors API
// ============================================================================

/**
 * GET /api/visa-sponsors/status - Get status of the visa sponsor service
 */
apiRouter.get('/visa-sponsors/status', async (req: Request, res: Response) => {
  try {
    const status = visaSponsors.getStatus();
    const response: ApiResponse<VisaSponsorStatusResponse> = {
      success: true,
      data: status,
    };
    res.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/visa-sponsors/search - Search for visa sponsors
 */
const visaSponsorSearchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(200).optional(),
  minScore: z.number().int().min(0).max(100).optional(),
});

apiRouter.post('/visa-sponsors/search', async (req: Request, res: Response) => {
  try {
    const input = visaSponsorSearchSchema.parse(req.body);
    
    const results = visaSponsors.searchSponsors(input.query, {
      limit: input.limit,
      minScore: input.minScore,
    });
    
    const response: ApiResponse<VisaSponsorSearchResponse> = {
      success: true,
      data: {
        results,
        query: input.query,
        total: results.length,
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
 * GET /api/visa-sponsors/organization/:name - Get all entries for an organization
 */
apiRouter.get('/visa-sponsors/organization/:name', async (req: Request, res: Response) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const entries = visaSponsors.getOrganizationDetails(name);
    
    if (entries.length === 0) {
      return res.status(404).json({ success: false, error: 'Organization not found' });
    }
    
    res.json({
      success: true,
      data: entries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * POST /api/visa-sponsors/update - Trigger a manual update of the visa sponsor list
 */
apiRouter.post('/visa-sponsors/update', async (req: Request, res: Response) => {
  try {
    const result = await visaSponsors.downloadLatestCsv();
    
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.message });
    }
    
    res.json({
      success: true,
      data: {
        message: result.message,
        status: visaSponsors.getStatus(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});
