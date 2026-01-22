import { Router, Request, Response } from 'express';
import { updateSettingsSchema } from '@shared/settings-schema.js';
import * as settingsRepo from '@server/repositories/settings.js';
import {
  applyEnvValue,
  normalizeEnvInput,
} from '@server/services/envSettings.js';
import {
  extractProjectsFromProfile,
  normalizeResumeProjectsSettings,
} from '@server/services/resumeProjects.js';
import { getProfile } from '@server/services/profile.js';
import { getEffectiveSettings } from '@server/services/settings.js';

export const settingsRouter = Router();

/**
 * GET /api/settings - Get app settings (effective + defaults)
 */
settingsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const data = await getEffectiveSettings();
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * PATCH /api/settings - Update settings overrides
 */
settingsRouter.patch('/', async (req: Request, res: Response) => {
  try {
    const input = updateSettingsSchema.parse(req.body);
    const promises: Promise<void>[] = [];

    if ('model' in input) {
      promises.push(settingsRepo.setSetting('model', input.model ?? null));
    }

    if ('modelScorer' in input) {
      promises.push(settingsRepo.setSetting('modelScorer', input.modelScorer ?? null));
    }
    if ('modelTailoring' in input) {
      promises.push(settingsRepo.setSetting('modelTailoring', input.modelTailoring ?? null));
    }
    if ('modelProjectSelection' in input) {
      promises.push(settingsRepo.setSetting('modelProjectSelection', input.modelProjectSelection ?? null));
    }

    if ('pipelineWebhookUrl' in input) {
      promises.push(settingsRepo.setSetting('pipelineWebhookUrl', input.pipelineWebhookUrl ?? null));
    }

    if ('jobCompleteWebhookUrl' in input) {
      promises.push(settingsRepo.setSetting('jobCompleteWebhookUrl', input.jobCompleteWebhookUrl ?? null));
    }

    if ('resumeProjects' in input) {
      const resumeProjects = input.resumeProjects ?? null;

      if (resumeProjects === null) {
        promises.push(settingsRepo.setSetting('resumeProjects', null));
      } else {
        promises.push((async () => {
          const rawProfile = await getProfile();

          if (rawProfile === null || typeof rawProfile !== 'object' || Array.isArray(rawProfile)) {
            throw new Error('Invalid resume profile format: expected a non-null object');
          }

          const profile = rawProfile as Record<string, unknown>;
          const { catalog } = extractProjectsFromProfile(profile);
          const allowed = new Set(catalog.map((p) => p.id));
          const normalized = normalizeResumeProjectsSettings(resumeProjects, allowed);
          await settingsRepo.setSetting('resumeProjects', JSON.stringify(normalized));
        })());
      }
    }

    if ('ukvisajobsMaxJobs' in input) {
      const val = input.ukvisajobsMaxJobs ?? null;
      promises.push(settingsRepo.setSetting('ukvisajobsMaxJobs', val !== null ? String(val) : null));
    }

    if ('gradcrackerMaxJobsPerTerm' in input) {
      const val = input.gradcrackerMaxJobsPerTerm ?? null;
      promises.push(settingsRepo.setSetting('gradcrackerMaxJobsPerTerm', val !== null ? String(val) : null));
    }

    if ('searchTerms' in input) {
      const val = input.searchTerms ?? null;
      promises.push(settingsRepo.setSetting('searchTerms', val !== null ? JSON.stringify(val) : null));
    }

    if ('jobspyLocation' in input) {
      promises.push(settingsRepo.setSetting('jobspyLocation', input.jobspyLocation ?? null));
    }

    if ('jobspyResultsWanted' in input) {
      const val = input.jobspyResultsWanted ?? null;
      promises.push(settingsRepo.setSetting('jobspyResultsWanted', val !== null ? String(val) : null));
    }

    if ('jobspyHoursOld' in input) {
      const val = input.jobspyHoursOld ?? null;
      promises.push(settingsRepo.setSetting('jobspyHoursOld', val !== null ? String(val) : null));
    }

    if ('jobspyCountryIndeed' in input) {
      promises.push(settingsRepo.setSetting('jobspyCountryIndeed', input.jobspyCountryIndeed ?? null));
    }

    if ('jobspySites' in input) {
      const val = input.jobspySites ?? null;
      promises.push(settingsRepo.setSetting('jobspySites', val !== null ? JSON.stringify(val) : null));
    }

    if ('jobspyLinkedinFetchDescription' in input) {
      const val = input.jobspyLinkedinFetchDescription ?? null;
      promises.push(settingsRepo.setSetting('jobspyLinkedinFetchDescription', val !== null ? (val ? '1' : '0') : null));
    }

    if ('showSponsorInfo' in input) {
      const val = input.showSponsorInfo ?? null;
      promises.push(settingsRepo.setSetting('showSponsorInfo', val !== null ? (val ? '1' : '0') : null));
    }

    if ('openrouterApiKey' in input) {
      const value = normalizeEnvInput(input.openrouterApiKey);
      promises.push(settingsRepo.setSetting('openrouterApiKey', value).then(() => {
        applyEnvValue('OPENROUTER_API_KEY', value);
      }));
    }

    if ('rxresumeEmail' in input) {
      const value = normalizeEnvInput(input.rxresumeEmail);
      promises.push(settingsRepo.setSetting('rxresumeEmail', value).then(() => {
        applyEnvValue('RXRESUME_EMAIL', value);
      }));
    }

    if ('rxresumePassword' in input) {
      const value = normalizeEnvInput(input.rxresumePassword);
      promises.push(settingsRepo.setSetting('rxresumePassword', value).then(() => {
        applyEnvValue('RXRESUME_PASSWORD', value);
      }));
    }

    if ('basicAuthUser' in input) {
      const value = normalizeEnvInput(input.basicAuthUser);
      promises.push(settingsRepo.setSetting('basicAuthUser', value).then(() => {
        applyEnvValue('BASIC_AUTH_USER', value);
      }));
    }

    if ('basicAuthPassword' in input) {
      const value = normalizeEnvInput(input.basicAuthPassword);
      promises.push(settingsRepo.setSetting('basicAuthPassword', value).then(() => {
        applyEnvValue('BASIC_AUTH_PASSWORD', value);
      }));
    }

    if ('ukvisajobsEmail' in input) {
      const value = normalizeEnvInput(input.ukvisajobsEmail);
      promises.push(settingsRepo.setSetting('ukvisajobsEmail', value).then(() => {
        applyEnvValue('UKVISAJOBS_EMAIL', value);
      }));
    }

    if ('ukvisajobsPassword' in input) {
      const value = normalizeEnvInput(input.ukvisajobsPassword);
      promises.push(settingsRepo.setSetting('ukvisajobsPassword', value).then(() => {
        applyEnvValue('UKVISAJOBS_PASSWORD', value);
      }));
    }

    if ('webhookSecret' in input) {
      const value = normalizeEnvInput(input.webhookSecret);
      promises.push(settingsRepo.setSetting('webhookSecret', value).then(() => {
        applyEnvValue('WEBHOOK_SECRET', value);
      }));
    }

    await Promise.all(promises);

    const data = await getEffectiveSettings();
    res.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ success: false, error: message });
  }
});
