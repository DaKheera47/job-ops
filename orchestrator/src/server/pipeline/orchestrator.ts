/**
 * Main pipeline logic - orchestrates the daily job processing flow.
 *
 * Flow:
 * 1. Run crawler to discover new jobs
 * 2. Score jobs for suitability
 * 3. Leave all jobs in "discovered" for manual processing
 */

import { join } from "node:path";
import { logger } from "@infra/logger";
import { trackServerProductEvent } from "@infra/product-analytics";
import { runWithRequestContext } from "@infra/request-context";
import { getActiveTenantId } from "@server/tenancy/context";
import { createLocationIntentFromLegacyInputs } from "@shared/location-domain.js";
import type { PipelineConfig, PipelineRunSavedDetails } from "@shared/types";
import { getDataDir } from "../config/dataDir";
import * as jobsRepo from "../repositories/jobs";
import * as pipelineRepo from "../repositories/pipeline";
import * as settingsRepo from "../repositories/settings";
import { generatePdf } from "../services/pdf";
import { getProfile } from "../services/profile";
import { pickProjectIdsForJob } from "../services/projectSelection";
import {
  extractProjectsFromProfile,
  resolveResumeProjectsSettings,
} from "../services/resumeProjects";
import { generateTailoring } from "../services/summary";
import {
  type PendingChallenge,
  progressHelpers,
  resetProgress,
} from "./progress";
import {
  buildPipelineRunSavedDetails,
  createPipelineRunResultSummary,
  updatePipelineRunResultSummary,
} from "./run-details";
import {
  discoverJobsStep,
  importJobsStep,
  loadProfileStep,
  notifyPipelineWebhookStep,
  processJobsStep,
  scoreJobsStep,
  selectJobsStep,
} from "./steps";

const DEFAULT_CONFIG: PipelineConfig = {
  topN: 10,
  minSuitabilityScore: 50,
  // Keep Glassdoor opt-in via source picker/settings; do not enable by default.
  sources: ["gradcracker", "indeed", "linkedin", "ukvisajobs"],
  outputDir: join(getDataDir(), "pdfs"),
  enableCrawling: true,
  enableScoring: true,
  enableImporting: true,
  enableAutoTailoring: true,
};

type TenantPipelineState = {
  isRunning: boolean;
  activePipelineRunId: string | null;
  cancelRequestedAt: string | null;
  activeChallengeState: ChallengeState | null;
};

type ChallengeState = {
  challenges: Map<string, PendingChallenge>;
  /** Resolves the Promise that blocks the pipeline in `runPipeline`. */
  resolve: () => void;
};

const pipelineStateByTenant = new Map<string, TenantPipelineState>();

function getPipelineState(tenantId = getActiveTenantId()): TenantPipelineState {
  let state = pipelineStateByTenant.get(tenantId);
  if (!state) {
    state = {
      isRunning: false,
      activePipelineRunId: null,
      cancelRequestedAt: null,
      activeChallengeState: null,
    };
    pipelineStateByTenant.set(tenantId, state);
  }
  return state;
}

function parseWorkplaceTypes(
  raw: string | undefined,
): Array<"remote" | "hybrid" | "onsite"> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is "remote" | "hybrid" | "onsite" =>
        value === "remote" || value === "hybrid" || value === "onsite",
    );
  } catch {
    return [];
  }
}

async function resolveLocationIntent(
  config: Partial<PipelineConfig>,
): Promise<NonNullable<PipelineConfig["locationIntent"]>> {
  if (config.locationIntent) {
    return createLocationIntentFromLegacyInputs(config.locationIntent);
  }

  const settings = await settingsRepo.getAllSettings();
  return createLocationIntentFromLegacyInputs({
    selectedCountry: settings.jobspyCountryIndeed ?? "",
    searchCities: settings.searchCities ?? settings.jobspyLocation ?? "",
    workplaceTypes: parseWorkplaceTypes(settings.workplaceTypes),
    searchScope: settings.locationSearchScope,
    matchStrictness: settings.locationMatchStrictness,
  });
}

// ---------- Challenge pause/resume state ----------

// The pipeline async function stays alive in memory while paused — there's no
// state serialization. A server restart kills a paused pipeline, same as it
// kills a running one. This is intentional: challenges happen at most once
// per day per extractor, and the user is actively present to solve them.

/**
 * Returns the list of challenges currently blocking the pipeline, or empty if
 * the pipeline is not paused on challenges.
 */
export function getPendingChallenges(): PendingChallenge[] {
  const challengeState = getPipelineState().activeChallengeState;
  if (!challengeState) return [];
  return Array.from(challengeState.challenges.values());
}

/**
 * Mark a single challenge as resolved (called by the solve-challenge API after
 * the headed browser session succeeds).  When no challenges remain the blocked
 * pipeline Promise is resolved and discovery re-runs the affected extractors.
 */
export function resolvePipelineChallenge(extractorId: string): {
  resolved: boolean;
  remaining: number;
} {
  const state = getPipelineState();
  const challengeState = state.activeChallengeState;
  if (!challengeState) return { resolved: false, remaining: 0 };

  const deleted = challengeState.challenges.delete(extractorId);
  const remaining = challengeState.challenges.size;

  // Update progress so the UI reflects the change immediately
  progressHelpers.challengeResolved(
    Array.from(challengeState.challenges.values()),
  );

  if (remaining === 0) {
    challengeState.resolve();
  }

  return { resolved: deleted, remaining };
}

// ---------- Cancellation ----------

class PipelineCancelledError extends Error {
  constructor(message = "Pipeline cancellation requested") {
    super(message);
    this.name = "PipelineCancelledError";
  }
}

function ensureNotCancelled(tenantId = getActiveTenantId()): void {
  if (getPipelineState(tenantId).cancelRequestedAt) {
    throw new PipelineCancelledError();
  }
}

/**
 * Run the full job discovery and processing pipeline.
 */
export async function runPipeline(
  config: Partial<PipelineConfig> = {},
): Promise<{
  success: boolean;
  jobsDiscovered: number;
  jobsProcessed: number;
  error?: string;
}> {
  const tenantId = getActiveTenantId();
  const tenantState = getPipelineState(tenantId);
  if (tenantState.isRunning) {
    return {
      success: false,
      jobsDiscovered: 0,
      jobsProcessed: 0,
      error: "Pipeline is already running",
    };
  }

  tenantState.isRunning = true;
  tenantState.activePipelineRunId = "pending";
  tenantState.cancelRequestedAt = null;
  resetProgress();
  const locationIntent = await resolveLocationIntent(config);
  const mergedConfig = { ...DEFAULT_CONFIG, ...config, locationIntent };
  const configSnapshot = {
    topN: mergedConfig.topN,
    minSuitabilityScore: mergedConfig.minSuitabilityScore,
    sources: mergedConfig.sources,
    locationIntent,
  } as const;

  let savedDetails: PipelineRunSavedDetails | null = null;
  try {
    savedDetails = await buildPipelineRunSavedDetails(mergedConfig);
  } catch (error) {
    logger.warn("Failed to capture pipeline run settings snapshot", { error });
  }

  const pipelineRun = await pipelineRepo.createPipelineRun({
    configSnapshot,
    savedDetails,
  });
  tenantState.activePipelineRunId = pipelineRun.id;

  return runWithRequestContext({ pipelineRunId: pipelineRun.id }, async () => {
    const pipelineLogger = logger.child({ pipelineRunId: pipelineRun.id });
    let jobsDiscovered = 0;
    let jobsProcessed = 0;
    let resultSummary =
      savedDetails?.resultSummary ?? createPipelineRunResultSummary();
    const persistResultSummary = async (
      update: Parameters<typeof updatePipelineRunResultSummary>[1],
    ) => {
      resultSummary = updatePipelineRunResultSummary(resultSummary, update);
      await pipelineRepo.updatePipelineRun(pipelineRun.id, {
        resultSummary,
      });
    };
    pipelineLogger.info("Starting pipeline run", {
      topN: mergedConfig.topN,
      minSuitabilityScore: mergedConfig.minSuitabilityScore,
      sources: mergedConfig.sources,
      locationIntent: mergedConfig.locationIntent,
    });

    try {
      ensureNotCancelled(tenantId);
      await persistResultSummary({ stage: "started" });
      const profile = await loadProfileStep();
      await persistResultSummary({ stage: "profile_loaded" });

      ensureNotCancelled(tenantId);
      await persistResultSummary({ stage: "discovery" });
      let { discoveredJobs, sourceErrors, pendingChallenges } =
        await discoverJobsStep({
          mergedConfig,
          shouldCancel: () =>
            getPipelineState(tenantId).cancelRequestedAt !== null,
        });
      await persistResultSummary({
        stage: "discovery",
        sourceErrors,
      });

      // ---------- Challenge pause/resume ----------
      if (pendingChallenges.length > 0) {
        pipelineLogger.info("Challenges detected, pausing pipeline", {
          challenges: pendingChallenges.map((c) => ({
            extractorId: c.extractorId,
            url: c.url,
          })),
        });

        progressHelpers.challengeRequired(pendingChallenges);

        // Block until all challenges are resolved by the solve-challenge API.
        // The Promise is resolved by `resolvePipelineChallenge()`, which is
        // called from the POST /api/pipeline/solve-challenge endpoint (4d).
        // Cancellation still works: the cancel endpoint sets cancelRequestedAt,
        // and ensureNotCancelled() fires after the Promise resolves.
        const challengedSources = pendingChallenges.flatMap((c) => c.sources);

        await new Promise<void>((resolve) => {
          tenantState.activeChallengeState = {
            challenges: new Map(
              pendingChallenges.map((c) => [c.extractorId, c]),
            ),
            resolve,
          };
        });
        tenantState.activeChallengeState = null;

        ensureNotCancelled(tenantId);

        // Re-run only the extractors that had challenges
        pipelineLogger.info("Challenges resolved, re-running extractors", {
          sources: challengedSources,
        });

        const retryConfig = { ...mergedConfig, sources: challengedSources };
        const retryResult = await discoverJobsStep({
          mergedConfig: retryConfig,
          shouldCancel: () =>
            getPipelineState(tenantId).cancelRequestedAt !== null,
        });

        discoveredJobs = [...discoveredJobs, ...retryResult.discoveredJobs];
        sourceErrors = [...sourceErrors, ...retryResult.sourceErrors];
        pendingChallenges = retryResult.pendingChallenges;

        // If the retry itself hits challenges again (e.g. cookie expired
        // between solve and retry), we don't loop — just continue with whatever
        // the first run discovered.  The user will see partial results and can
        // re-run the pipeline.
        if (retryResult.pendingChallenges.length > 0) {
          pipelineLogger.warn(
            "Retry after challenge still has challenges — continuing with partial results",
            {
              retryPendingChallenges: retryResult.pendingChallenges.map(
                (c) => c.extractorId,
              ),
            },
          );
        }

        progressHelpers.crawlingComplete(discoveredJobs.length);
      }

      ensureNotCancelled(tenantId);
      const { created } = await importJobsStep({ discoveredJobs });
      jobsDiscovered = created;

      await persistResultSummary({ stage: "import" });
      await pipelineRepo.updatePipelineRun(pipelineRun.id, {
        jobsDiscovered: created,
      });

      ensureNotCancelled(tenantId);
      await persistResultSummary({ stage: "scoring" });
      const { unprocessedJobs, scoredJobs } = await scoreJobsStep({
        profile,
        shouldCancel: () =>
          getPipelineState(tenantId).cancelRequestedAt !== null,
      });
      await persistResultSummary({
        stage: "scoring",
        jobsScored: scoredJobs.length,
      });

      ensureNotCancelled(tenantId);
      await persistResultSummary({ stage: "selection" });
      const jobsToProcess = await selectJobsStep({
        scoredJobs,
        mergedConfig,
      });
      await persistResultSummary({
        stage: "selection",
        jobsScored: scoredJobs.length,
        jobsSelected: jobsToProcess.length,
      });

      pipelineLogger.info("Selected jobs for processing", {
        candidates: jobsToProcess.length,
      });

      await persistResultSummary({
        stage: "processing",
        jobsScored: scoredJobs.length,
        jobsSelected: jobsToProcess.length,
      });
      const { processedCount } = await processJobsStep({
        jobsToProcess,
        processJob,
        shouldCancel: () =>
          getPipelineState(tenantId).cancelRequestedAt !== null,
      });
      jobsProcessed = processedCount;

      resultSummary = updatePipelineRunResultSummary(resultSummary, {
        stage: "completed",
        jobsScored: scoredJobs.length,
        jobsSelected: jobsToProcess.length,
      });
      await pipelineRepo.updatePipelineRun(pipelineRun.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        jobsProcessed: processedCount,
        resultSummary,
      });

      progressHelpers.complete(created, processedCount);
      pipelineLogger.info("Pipeline run completed", {
        jobsDiscovered: created,
        jobsProcessed: processedCount,
      });

      await notifyPipelineWebhookStep("pipeline.completed", {
        pipelineRunId: pipelineRun.id,
        jobsDiscovered: created,
        jobsScored: unprocessedJobs.length,
        jobsProcessed: processedCount,
      });

      return {
        success: true,
        jobsDiscovered: created,
        jobsProcessed: processedCount,
      };
    } catch (error) {
      if (error instanceof PipelineCancelledError) {
        const message = "Cancelled by user request";
        await pipelineRepo.updatePipelineRun(pipelineRun.id, {
          status: "cancelled",
          completedAt: new Date().toISOString(),
          jobsDiscovered,
          jobsProcessed,
          errorMessage: message,
          resultSummary,
        });
        progressHelpers.cancelled(message);
        pipelineLogger.info("Pipeline run cancelled", {
          jobsDiscovered,
          jobsProcessed,
        });
        return {
          success: false,
          jobsDiscovered,
          jobsProcessed,
          error: message,
        };
      }

      const message = error instanceof Error ? error.message : "Unknown error";

      await pipelineRepo.updatePipelineRun(pipelineRun.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        errorMessage: message,
        resultSummary,
      });

      progressHelpers.failed(message);
      pipelineLogger.error("Pipeline run failed", error);

      await notifyPipelineWebhookStep("pipeline.failed", {
        pipelineRunId: pipelineRun.id,
        error: message,
      });

      return {
        success: false,
        jobsDiscovered,
        jobsProcessed,
        error: message,
      };
    } finally {
      tenantState.isRunning = false;
      tenantState.activePipelineRunId = null;
      tenantState.cancelRequestedAt = null;
      tenantState.activeChallengeState = null;
    }
  });
}

export type ProcessJobOptions = {
  force?: boolean;
  requestOrigin?: string | null;
  analyticsOrigin?:
    | "move_to_ready"
    | "generate_pdf"
    | "pipeline"
    | "manual_job_create";
};

/**
 * Step 1: Generate AI summary and suggest projects.
 */
export async function summarizeJob(
  jobId: string,
  options?: ProcessJobOptions,
): Promise<{
  success: boolean;
  error?: string;
}> {
  return runWithRequestContext({ jobId }, async () => {
    const jobLogger = logger.child({ jobId });
    jobLogger.info("Summarizing job");
    try {
      const job = await jobsRepo.getJobById(jobId);
      if (!job) return { success: false, error: "Job not found" };

      const profile = await getProfile();

      // 1. Generate Summary & Tailoring
      let tailoredSummary = job.tailoredSummary;
      let tailoredHeadline = job.tailoredHeadline;
      let tailoredSkills = job.tailoredSkills;

      if (!tailoredSummary || !tailoredHeadline || options?.force) {
        jobLogger.info("Generating tailoring content");
        const tailoringResult = await generateTailoring(
          job.jobDescription || "",
          profile,
        );
        if (tailoringResult.success && tailoringResult.data) {
          tailoredSummary = tailoringResult.data.summary;
          tailoredHeadline = tailoringResult.data.headline;
          tailoredSkills = JSON.stringify(tailoringResult.data.skills);
        } else if (options?.force || !tailoredSummary || !tailoredHeadline) {
          return {
            success: false,
            error: `Tailoring failed: ${tailoringResult.error || "unknown error"}`,
          };
        }
      }

      // 2. Suggest Projects
      let selectedProjectIds = job.selectedProjectIds;
      if (!selectedProjectIds || options?.force) {
        jobLogger.info("Selecting projects");
        try {
          const { catalog, selectionItems } =
            extractProjectsFromProfile(profile);
          const overrideResumeProjectsRaw =
            await settingsRepo.getSetting("resumeProjects");
          const { resumeProjects } = resolveResumeProjectsSettings({
            catalog,
            overrideRaw: overrideResumeProjectsRaw,
          });

          const locked = resumeProjects.lockedProjectIds;
          const desiredCount = Math.max(
            0,
            resumeProjects.maxProjects - locked.length,
          );
          const eligibleSet = new Set(resumeProjects.aiSelectableProjectIds);
          const eligibleProjects = selectionItems.filter((p) =>
            eligibleSet.has(p.id),
          );

          const picked = await pickProjectIdsForJob({
            jobDescription: job.jobDescription || "",
            eligibleProjects,
            desiredCount,
          });

          selectedProjectIds = [...locked, ...picked].join(",");
        } catch (error) {
          jobLogger.warn("Failed to suggest projects", error);
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
      const message = error instanceof Error ? error.message : "Unknown error";
      jobLogger.error("Summarization failed", error);
      return { success: false, error: message };
    }
  });
}

/**
 * Step 2: Generate PDF using current summary and project selection.
 */
export async function generateFinalPdf(
  jobId: string,
  options?: ProcessJobOptions,
): Promise<{
  success: boolean;
  error?: string;
}> {
  return runWithRequestContext({ jobId }, async () => {
    const jobLogger = logger.child({ jobId });
    jobLogger.info("Generating final PDF");
    try {
      const job = await jobsRepo.getJobById(jobId);
      if (!job) return { success: false, error: "Job not found" };

      // Mark as processing
      await jobsRepo.updateJob(job.id, { status: "processing" });

      const pdfResult = await generatePdf(
        job.id,
        {
          summary: job.tailoredSummary || "",
          headline: job.tailoredHeadline || "",
          skills: job.tailoredSkills ? JSON.parse(job.tailoredSkills) : [],
        },
        job.jobDescription || "",
        undefined, // deprecated baseResumePath parameter
        job.selectedProjectIds,
        {
          tracerLinksEnabled: job.tracerLinksEnabled,
          requestOrigin: options?.requestOrigin ?? null,
          tracerCompanyName: job.employer ?? null,
        },
      );

      if (!pdfResult.success) {
        // Revert status if failed
        await jobsRepo.updateJob(job.id, { status: "discovered" });
        return { success: false, error: pdfResult.error };
      }

      await jobsRepo.updateJob(job.id, {
        status: "ready",
        pdfPath: pdfResult.pdfPath,
      });

      const analyticsOrigin = options?.analyticsOrigin ?? "move_to_ready";
      const generationKind = job.status === "ready" ? "regenerate" : "initial";
      void trackServerProductEvent(
        "resume_generated",
        {
          origin: analyticsOrigin,
          generation_kind: generationKind,
          tracer_links_enabled: job.tracerLinksEnabled,
          has_tailored_summary: Boolean(job.tailoredSummary),
          has_tailored_skills: Boolean(job.tailoredSkills),
        },
        {
          requestOrigin: options?.requestOrigin ?? null,
          urlPath: "/jobs",
        },
      );

      if (job.status !== "ready") {
        void trackServerProductEvent(
          "job_moved_to_ready",
          {
            origin: analyticsOrigin,
            tracer_links_enabled: job.tracerLinksEnabled,
          },
          {
            requestOrigin: options?.requestOrigin ?? null,
            urlPath: "/jobs",
          },
        );
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      jobLogger.error("PDF generation failed", error);
      return { success: false, error: message };
    }
  });
}

/**
 * Process a single job (runs both steps in sequence).
 */
export async function processJob(
  jobId: string,
  options?: ProcessJobOptions,
): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    // Step 1: Summarize & Select Projects
    const sumResult = await summarizeJob(jobId, options);
    if (!sumResult.success) return sumResult;

    // Step 2: Generate PDF
    const pdfResult = await generateFinalPdf(jobId, options);
    return pdfResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, error: message };
  }
}

/**
 * Check if pipeline is currently running.
 */
export function getPipelineStatus(): { isRunning: boolean } {
  return { isRunning: getPipelineState().isRunning };
}

export function requestPipelineCancel(): {
  accepted: boolean;
  pipelineRunId: string | null;
  alreadyRequested: boolean;
} {
  const state = getPipelineState();
  if (!state.isRunning) {
    return { accepted: false, pipelineRunId: null, alreadyRequested: false };
  }

  const pipelineRunId =
    state.activePipelineRunId && state.activePipelineRunId !== "pending"
      ? state.activePipelineRunId
      : null;

  if (state.cancelRequestedAt) {
    return {
      accepted: true,
      pipelineRunId,
      alreadyRequested: true,
    };
  }

  state.cancelRequestedAt = new Date().toISOString();

  // Unblock the challenge pause if the pipeline is waiting for human solving.
  // Without this, cancellation during challenge_required would leave the
  // pipeline stuck until challenges are solved or the server restarts.
  // ensureNotCancelled() runs immediately after the paused Promise resolves.
  if (state.activeChallengeState) {
    state.activeChallengeState.resolve();
    state.activeChallengeState = null;
  }

  return {
    accepted: true,
    pipelineRunId,
    alreadyRequested: false,
  };
}

export function isPipelineCancelRequested(): boolean {
  return getPipelineState().cancelRequestedAt !== null;
}
