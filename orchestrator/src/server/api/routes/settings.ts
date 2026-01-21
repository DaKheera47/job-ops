import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as settingsRepo from '../../repositories/settings.js';
import {
  extractProjectsFromProfile,
  normalizeResumeProjectsSettings,
  resolveResumeProjectsSettings,
} from '../../services/resumeProjects.js';
import { getProfile } from '../../services/profile.js';

export const settingsRouter = Router();

/**
 * GET /api/settings - Get app settings (effective + defaults)
 */
settingsRouter.get('/', async (_req: Request, res: Response) => {
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

    const profile = await getProfile();
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

    // Show Sponsor Info setting (on by default)
    const overrideShowSponsorInfoRaw = await settingsRepo.getSetting('showSponsorInfo');
    const defaultShowSponsorInfo = true;
    const overrideShowSponsorInfo = overrideShowSponsorInfoRaw
      ? overrideShowSponsorInfoRaw === 'true' || overrideShowSponsorInfoRaw === '1'
      : null;
    const showSponsorInfo = overrideShowSponsorInfo ?? defaultShowSponsorInfo;

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
        showSponsorInfo,
        defaultShowSponsorInfo,
        overrideShowSponsorInfo,
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
  showSponsorInfo: z.boolean().nullable().optional(),
});

/**
 * PATCH /api/settings - Update settings overrides
 */
settingsRouter.patch('/', async (req: Request, res: Response) => {
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
        const rawProfile = await getProfile();

        if (rawProfile === null || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
          throw new Error('Invalid resume profile format: expected a non-null object');
        }

        const profile = rawProfile as Record<string, unknown>;
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

    if ('showSponsorInfo' in input) {
      const value = input.showSponsorInfo ?? null;
      await settingsRepo.setSetting('showSponsorInfo', value !== null ? (value ? '1' : '0') : null);
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

    const profile = await getProfile();
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

    // Show Sponsor Info setting
    const overrideShowSponsorInfoRaw = await settingsRepo.getSetting('showSponsorInfo');
    const defaultShowSponsorInfo = true;
    const overrideShowSponsorInfo = overrideShowSponsorInfoRaw
      ? overrideShowSponsorInfoRaw === 'true' || overrideShowSponsorInfoRaw === '1'
      : null;
    const showSponsorInfo = overrideShowSponsorInfo ?? defaultShowSponsorInfo;

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
        showSponsorInfo,
        defaultShowSponsorInfo,
        overrideShowSponsorInfo,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // PATCH usually returns 500 for unknown, but let's stick to what was there (400?)
    // Wait, the file said 400? Let's verify line 608.
    res.status(400).json({ success: false, error: message });
  }
});
