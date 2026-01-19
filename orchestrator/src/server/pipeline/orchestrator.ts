/**
 * Main pipeline logic - orchestrates the daily job processing flow.
 * 
 * Flow:
 * 1. Run crawler to discover new jobs
 * 2. Score jobs for suitability
 * 3. Leave all jobs in "discovered" for manual processing
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { runCrawler } from '../services/crawler.js';
import { runJobSpy } from '../services/jobspy.js';
import { runUkVisaJobs } from '../services/ukvisajobs.js';
import { scoreJobSuitability } from '../services/scorer.js';
import { generateTailoring } from '../services/summary.js';
import { generatePdf } from '../services/pdf.js';
import { getSetting } from '../repositories/settings.js';
import { pickProjectIdsForJob } from '../services/projectSelection.js';
import { extractProjectsFromProfile, resolveResumeProjectsSettings } from '../services/resumeProjects.js';
import * as jobsRepo from '../repositories/jobs.js';
import * as pipelineRepo from '../repositories/pipeline.js';
import * as settingsRepo from '../repositories/settings.js';
import { progressHelpers, resetProgress, updateProgress } from './progress.js';
import type { CreateJobInput, Job, JobSource, PipelineConfig } from '../../shared/types.js';
import { getDataDir } from '../config/dataDir.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILE_PATH = join(__dirname, '../../../../resume-generator/base.json');

const DEFAULT_CONFIG: PipelineConfig = {
  topN: 10,
  minSuitabilityScore: 50,
  sources: ['gradcracker', 'indeed', 'linkedin', 'ukvisajobs'],
  profilePath: DEFAULT_PROFILE_PATH,
  outputDir: join(getDataDir(), 'pdfs'),
  enableCrawling: true,
  enableScoring: true,
  enableImporting: true,
  enableAutoTailoring: true,
};

// Track if pipeline is currently running
let isPipelineRunning = false;

async function notifyPipelineWebhook(
  event: 'pipeline.completed' | 'pipeline.failed',
  payload: Record<string, unknown>
) {
  const overridePipelineWebhookUrl = await settingsRepo.getSetting('pipelineWebhookUrl')
  const pipelineWebhookUrl = (
    overridePipelineWebhookUrl ||
    process.env.PIPELINE_WEBHOOK_URL ||
    process.env.WEBHOOK_URL ||
    ''
  ).trim()
  if (!pipelineWebhookUrl) return

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const secret = process.env.WEBHOOK_SECRET
    if (secret) headers.Authorization = `Bearer ${secret}`

    const response = await fetch(pipelineWebhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event,
        sentAt: new Date().toISOString(),
        ...payload,
      }),
    })

    if (!response.ok) {
      console.warn(`⚠️ Pipeline webhook POST failed (${response.status}): ${await response.text()}`)
    }
  } catch (error) {
    console.warn('⚠️ Pipeline webhook POST failed:', error)
  }
}

/**
 * Run the full job discovery and processing pipeline.
 */
export async function runPipeline(config: Partial<PipelineConfig> = {}): Promise<{
  success: boolean;
  jobsDiscovered: number;
  jobsProcessed: number;
  error?: string;
}> {
  if (isPipelineRunning) {
    return {
      success: false,
      jobsDiscovered: 0,
      jobsProcessed: 0,
      error: 'Pipeline is already running',
    };
  }

  isPipelineRunning = true;
  resetProgress();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // Create pipeline run record
  const pipelineRun = await pipelineRepo.createPipelineRun();

  console.log('🚀 Starting job pipeline...');
  console.log(`   Config: topN=${mergedConfig.topN}, minScore=${mergedConfig.minSuitabilityScore} (manual processing)`);

  try {
    // Step 1: Load profile
    console.log('\n📋 Loading profile...');
    const profile = await loadProfile(mergedConfig.profilePath);

    // Step 2: Run crawler
    console.log('\n🕷️ Running crawler...');
    progressHelpers.startCrawling();
    const discoveredJobs: CreateJobInput[] = [];
    const sourceErrors: string[] = [];

    if (mergedConfig.enableCrawling) {

    // Read search terms setting
    const searchTermsSetting = await settingsRepo.getSetting('searchTerms');
    let searchTerms: string[] = [];

    if (searchTermsSetting) {
      searchTerms = JSON.parse(searchTermsSetting) as string[];
    } else {
      // Default from env var
      const defaultSearchTermsEnv = process.env.JOBSPY_SEARCH_TERMS || 'web developer';
      searchTerms = defaultSearchTermsEnv.split('|').map(s => s.trim()).filter(Boolean);
    }

    // Run JobSpy (Indeed/LinkedIn) if selected
    let jobSpySites = mergedConfig.sources.filter(
      (s): s is 'indeed' | 'linkedin' => s === 'indeed' || s === 'linkedin'
    );

    // Apply setting override for JobSpy sites
    const jobspySitesSettingRaw = await settingsRepo.getSetting('jobspySites');
    if (jobspySitesSettingRaw) {
      try {
        const allowed = JSON.parse(jobspySitesSettingRaw);
        if (Array.isArray(allowed)) {
          jobSpySites = jobSpySites.filter((s) => allowed.includes(s));
        }
      } catch {
        // ignore JSON parse error
      }
    }

    if (jobSpySites.length > 0) {
      updateProgress({
        step: 'crawling',
        detail: `JobSpy: scraping ${jobSpySites.join(', ')}...`,
      });

      const jobspyLocationSetting = await settingsRepo.getSetting('jobspyLocation');
      const jobspyResultsWantedSetting = await settingsRepo.getSetting('jobspyResultsWanted');
      const jobspyHoursOldSetting = await settingsRepo.getSetting('jobspyHoursOld');
      const jobspyCountryIndeedSetting = await settingsRepo.getSetting('jobspyCountryIndeed');
      const jobspyLinkedinFetchDescriptionSetting = await settingsRepo.getSetting('jobspyLinkedinFetchDescription');

      const jobSpyResult = await runJobSpy({
        sites: jobSpySites,
        searchTerms,
        location: jobspyLocationSetting ?? undefined,
        resultsWanted: jobspyResultsWantedSetting ? parseInt(jobspyResultsWantedSetting, 10) : undefined,
        hoursOld: jobspyHoursOldSetting ? parseInt(jobspyHoursOldSetting, 10) : undefined,
        countryIndeed: jobspyCountryIndeedSetting ?? undefined,
        linkedinFetchDescription: jobspyLinkedinFetchDescriptionSetting !== null ? jobspyLinkedinFetchDescriptionSetting === '1' : undefined,
      });
      if (!jobSpyResult.success) {
        sourceErrors.push(`jobspy: ${jobSpyResult.error ?? 'unknown error'}`);
      } else {
        discoveredJobs.push(...jobSpyResult.jobs);
      }
    }

    // Run Gradcracker crawler if selected
    if (mergedConfig.sources.includes('gradcracker')) {
      updateProgress({
        step: 'crawling',
        detail: 'Gradcracker: scraping...',
      });

      // Pass existing URLs to avoid clicking "Apply" on jobs we already have
      const existingJobUrls = await jobsRepo.getAllJobUrls();

      const gradcrackerMaxJobsSetting = await settingsRepo.getSetting('gradcrackerMaxJobsPerTerm');
      const gradcrackerMaxJobs = gradcrackerMaxJobsSetting ? parseInt(gradcrackerMaxJobsSetting, 10) : 50;

      const crawlerResult = await runCrawler({
        existingJobUrls,
        searchTerms,
        maxJobsPerTerm: gradcrackerMaxJobs,
        onProgress: (progress) => {
          // Calculate overall progress based on list pages processed vs total
          // This is rough but better than nothing
          if (progress.listPagesTotal && progress.listPagesTotal > 0) {
            const percent = Math.round((progress.listPagesProcessed ?? 0) / progress.listPagesTotal * 100);
            updateProgress({
              step: 'crawling',
              detail: `Gradcracker: ${percent}% (scan ${progress.listPagesProcessed}/${progress.listPagesTotal}, found ${progress.jobCardsFound})`,
            });
          }
        },
      });

      if (!crawlerResult.success) {
        sourceErrors.push(`gradcracker: ${crawlerResult.error ?? 'unknown error'}`);
      } else {
        discoveredJobs.push(...crawlerResult.jobs);
      }
    }

    // Run UKVisaJobs extractor if selected
    if (mergedConfig.sources.includes('ukvisajobs')) {
      updateProgress({
        step: 'crawling',
        detail: 'UKVisaJobs: scraping visa-sponsoring jobs...',
      });

      // Read max jobs setting from database (default to 50 if not set)
      const ukvisajobsMaxJobsSetting = await settingsRepo.getSetting('ukvisajobsMaxJobs');
      const ukvisajobsMaxJobs = ukvisajobsMaxJobsSetting ? parseInt(ukvisajobsMaxJobsSetting, 10) : 50;

      const ukVisaResult = await runUkVisaJobs({
        maxJobs: ukvisajobsMaxJobs,
        searchTerms,
      });
      if (!ukVisaResult.success) {
        sourceErrors.push(`ukvisajobs: ${ukVisaResult.error ?? 'unknown error'}`);
      } else {
        discoveredJobs.push(...ukVisaResult.jobs);
      }
    }

    if (discoveredJobs.length === 0 && sourceErrors.length > 0) {
      throw new Error(`All sources failed: ${sourceErrors.join('; ')}`);
    }

      if (sourceErrors.length > 0) {
        console.warn(`⚠️ Some sources failed: ${sourceErrors.join('; ')}`);
      }
    } else {
      console.log('   ⏭️  Crawling disabled - skipping');
    }

    progressHelpers.crawlingComplete(discoveredJobs.length);

    // Step 3: Import discovered jobs
    console.log('\n💾 Importing jobs to database...');
    let created = 0;
    let skipped = 0;
    
    if (mergedConfig.enableImporting && discoveredJobs.length > 0) {
      const result = await jobsRepo.bulkCreateJobs(discoveredJobs);
      created = result.created;
      skipped = result.skipped;
      console.log(`   Created: ${created}, Skipped (duplicates): ${skipped}`);
    } else if (!mergedConfig.enableImporting) {
      console.log('   ⏭️  Importing disabled - skipping');
    } else {
      console.log('   No jobs to import');
    }

    progressHelpers.importComplete(created, skipped);

    await pipelineRepo.updatePipelineRun(pipelineRun.id, {
      jobsDiscovered: created,
    });

    // Step 4: Score all discovered jobs missing a score
    console.log('\n🎯 Scoring jobs for suitability...');
    const scoredJobs: Array<Job & { suitabilityScore: number; suitabilityReason: string }> = [];
    
    if (mergedConfig.enableScoring) {
      const unprocessedJobs = await jobsRepo.getUnscoredDiscoveredJobs();

      updateProgress({
        step: 'scoring',
        jobsDiscovered: unprocessedJobs.length,
        jobsScored: 0,
        jobsProcessed: 0,
        totalToProcess: 0,
        currentJob: undefined,
      });

      // Score jobs with progress updates
      for (let i = 0; i < unprocessedJobs.length; i++) {
        const job = unprocessedJobs[i];
        const hasCachedScore = typeof job.suitabilityScore === 'number' && !Number.isNaN(job.suitabilityScore);
        progressHelpers.scoringJob(i + 1, unprocessedJobs.length, hasCachedScore ? `${job.title} (cached)` : job.title);

        if (hasCachedScore) {
          scoredJobs.push({
            ...job,
            suitabilityScore: job.suitabilityScore as number,
            suitabilityReason: job.suitabilityReason ?? '',
          });
          continue;
        }

        const { score, reason } = await scoreJobSuitability(job, profile);
        scoredJobs.push({
          ...job,
          suitabilityScore: score,
          suitabilityReason: reason,
        });

        // Update score in database
        await jobsRepo.updateJob(job.id, {
          suitabilityScore: score,
          suitabilityReason: reason,
        });
      }

      progressHelpers.scoringComplete(scoredJobs.length);
      console.log(`\n📊 Scored ${scoredJobs.length} jobs.`);
    } else {
      console.log('   ⏭️  Scoring disabled - skipping');
      progressHelpers.scoringComplete(0);
    }

    // Step 5: Auto-process top jobs
    console.log('\n🏭 Auto-processing top jobs...');
    let processedCount = 0;

    if (mergedConfig.enableAutoTailoring) {
      // If scoring was disabled, fetch already-scored jobs from the database
      let jobsToProcess;
      if (scoredJobs.length === 0 && !mergedConfig.enableScoring) {
        // Scoring was disabled, but we may have already-scored jobs to process
        const alreadyScoredJobs = await jobsRepo.getUnscoredDiscoveredJobs();
        jobsToProcess = alreadyScoredJobs
          .filter(j => typeof j.suitabilityScore === 'number' && !Number.isNaN(j.suitabilityScore))
          .filter(j => (j.suitabilityScore ?? 0) >= mergedConfig.minSuitabilityScore)
          .sort((a, b) => (b.suitabilityScore ?? 0) - (a.suitabilityScore ?? 0))
          .slice(0, mergedConfig.topN);
      } else {
        jobsToProcess = scoredJobs
          .filter(j => (j.suitabilityScore ?? 0) >= mergedConfig.minSuitabilityScore)
          .sort((a, b) => (b.suitabilityScore ?? 0) - (a.suitabilityScore ?? 0))
          .slice(0, mergedConfig.topN);
      }

      console.log(`   Found ${jobsToProcess.length} candidates (score >= ${mergedConfig.minSuitabilityScore}, top ${mergedConfig.topN})`);

      if (jobsToProcess.length > 0) {
        updateProgress({
          step: 'processing',
          jobsProcessed: 0,
          totalToProcess: jobsToProcess.length,
        });

        for (let i = 0; i < jobsToProcess.length; i++) {
          const job = jobsToProcess[i];
          progressHelpers.processingJob(i + 1, jobsToProcess.length, job);

          // Process job (Generate Summary + PDF)
          // We catch errors here to ensure one failure doesn't stop the whole batch
          const result = await processJob(job.id);

          if (result.success) {
            processedCount++;
          } else {
            console.warn(`   ⚠️ Failed to process job ${job.id}: ${result.error}`);
          }

          progressHelpers.jobComplete(i + 1, jobsToProcess.length);
        }
      }
    } else {
      console.log('   ⏭️  Auto-tailoring disabled - skipping');
    }

    // Update pipeline run as completed
    await pipelineRepo.updatePipelineRun(pipelineRun.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
      jobsProcessed: processedCount,
    });

    console.log('\n🎉 Pipeline completed!');
    console.log(`   Jobs discovered: ${created}`);
    console.log(`   Jobs processed: ${processedCount}`);

    progressHelpers.complete(created, processedCount);

    await notifyPipelineWebhook('pipeline.completed', {
      pipelineRunId: pipelineRun.id,
      jobsDiscovered: created,
      jobsScored: scoredJobs.length,
      jobsProcessed: processedCount,
    })
    isPipelineRunning = false;

    return {
      success: true,
      jobsDiscovered: created,
      jobsProcessed: processedCount,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    await pipelineRepo.updatePipelineRun(pipelineRun.id, {
      status: 'failed',
      completedAt: new Date().toISOString(),
      errorMessage: message,
    });

    progressHelpers.failed(message);

    await notifyPipelineWebhook('pipeline.failed', {
      pipelineRunId: pipelineRun.id,
      error: message,
    })
    isPipelineRunning = false;

    console.error('\n❌ Pipeline failed:', message);

    return {
      success: false,
      jobsDiscovered: 0,
      jobsProcessed: 0,
      error: message,
    };
  }
}

/**
 * Step 1: Generate AI summary and suggest projects.
 */
export async function summarizeJob(
  jobId: string,
  options?: { force?: boolean }
): Promise<{
  success: boolean;
  error?: string;
}> {
  console.log(`📝 Summarizing job ${jobId}...`);

  try {
    const job = await jobsRepo.getJobById(jobId);
    if (!job) return { success: false, error: 'Job not found' };

    const profile = await loadProfile(DEFAULT_PROFILE_PATH);

    // 1. Generate Summary & Tailoring
    let tailoredSummary = job.tailoredSummary;
    let tailoredHeadline = job.tailoredHeadline;
    let tailoredSkills = job.tailoredSkills;

    if (!tailoredSummary || !tailoredHeadline || options?.force) {
      console.log('   Generating tailoring (summary, headline, skills)...');
      const tailoringResult = await generateTailoring(job.jobDescription || '', profile);
      if (tailoringResult.success && tailoringResult.data) {
        tailoredSummary = tailoringResult.data.summary;
        tailoredHeadline = tailoringResult.data.headline;
        tailoredSkills = JSON.stringify(tailoringResult.data.skills);
      }
    }

    // 2. Suggest Projects
    let selectedProjectIds = job.selectedProjectIds;
    if (!selectedProjectIds || options?.force) {
      console.log('   Suggesting projects...');
      try {
        const { catalog, selectionItems } = extractProjectsFromProfile(profile);
        const overrideResumeProjectsRaw = await getSetting('resumeProjects');
        const { resumeProjects } = resolveResumeProjectsSettings({ catalog, overrideRaw: overrideResumeProjectsRaw });

        const locked = resumeProjects.lockedProjectIds;
        const desiredCount = Math.max(0, resumeProjects.maxProjects - locked.length);
        const eligibleSet = new Set(resumeProjects.aiSelectableProjectIds);
        const eligibleProjects = selectionItems.filter((p) => eligibleSet.has(p.id));

        const picked = await pickProjectIdsForJob({
          jobDescription: job.jobDescription || '',
          eligibleProjects,
          desiredCount,
        });

        selectedProjectIds = [...locked, ...picked].join(',');
      } catch (err) {
        console.warn('   ⚠️ Failed to suggest projects, leaving empty');
      }
    }

    await jobsRepo.updateJob(job.id, {
      tailoredSummary: tailoredSummary ?? undefined,
      tailoredHeadline: tailoredHeadline ?? undefined,
      tailoredSkills: tailoredSkills ?? undefined,
      selectedProjectIds: selectedProjectIds ?? undefined,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Step 2: Generate PDF using current summary and project selection.
 */
export async function generateFinalPdf(
  jobId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  console.log(`📄 Generating final PDF for job ${jobId}...`);

  try {
    const job = await jobsRepo.getJobById(jobId);
    if (!job) return { success: false, error: 'Job not found' };

    // Mark as processing
    await jobsRepo.updateJob(job.id, { status: 'processing' });

    const pdfResult = await generatePdf(
      job.id,
      {
        summary: job.tailoredSummary || '',
        headline: job.tailoredHeadline || '',
        skills: job.tailoredSkills ? JSON.parse(job.tailoredSkills) : []
      },
      job.jobDescription || '',
      DEFAULT_PROFILE_PATH,
      job.selectedProjectIds
    );

    if (!pdfResult.success) {
      // Revert status if failed
      await jobsRepo.updateJob(job.id, { status: 'discovered' });
      return { success: false, error: pdfResult.error };
    }

    await jobsRepo.updateJob(job.id, {
      status: 'ready',
      pdfPath: pdfResult.pdfPath,
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Process a single job (runs both steps in sequence).
 */
export async function processJob(
  jobId: string,
  options?: { force?: boolean }
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Step 1: Summarize & Select Projects
    const sumResult = await summarizeJob(jobId, options);
    if (!sumResult.success) return sumResult;

    // Step 2: Generate PDF
    const pdfResult = await generateFinalPdf(jobId);
    return pdfResult;

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}

/**
 * Check if pipeline is currently running.
 */
export function getPipelineStatus(): { isRunning: boolean } {
  return { isRunning: isPipelineRunning };
}

/**
 * Load the user profile from JSON file.
 */
async function loadProfile(profilePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(profilePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('Failed to load profile, using empty object');
    return {};
  }
}
