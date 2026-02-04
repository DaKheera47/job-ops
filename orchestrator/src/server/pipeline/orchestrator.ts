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
import { runWithRequestContext } from "@infra/request-context";
import type { PipelineConfig } from "@shared/types";
import { getDataDir } from "../config/dataDir";
import * as jobsRepo from "../repositories/jobs";
import * as pipelineRepo from "../repositories/pipeline";
import { getSetting } from "../repositories/settings";
import { generatePdf } from "../services/pdf";
import { getProfile } from "../services/profile";
import { pickProjectIdsForJob } from "../services/projectSelection";
import {
  extractProjectsFromProfile,
  resolveResumeProjectsSettings,
} from "../services/resumeProjects";
import { generateTailoring } from "../services/summary";
import { progressHelpers, resetProgress } from "./progress";
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
  sources: ["gradcracker", "indeed", "linkedin", "ukvisajobs"],
  outputDir: join(getDataDir(), "pdfs"),
  enableCrawling: true,
  enableScoring: true,
  enableImporting: true,
  enableAutoTailoring: true,
};

// Track if pipeline is currently running
let isPipelineRunning = false;

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
  if (isPipelineRunning) {
    return {
      success: false,
      jobsDiscovered: 0,
      jobsProcessed: 0,
      error: "Pipeline is already running",
    };
  }

  isPipelineRunning = true;
  resetProgress();
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  const pipelineRun = await pipelineRepo.createPipelineRun();
  return runWithRequestContext({ pipelineRunId: pipelineRun.id }, async () => {
    const pipelineLogger = logger.child({ pipelineRunId: pipelineRun.id });
    pipelineLogger.info("Starting pipeline run", {
      topN: mergedConfig.topN,
      minSuitabilityScore: mergedConfig.minSuitabilityScore,
      sources: mergedConfig.sources,
    });

    try {
      const profile = await loadProfileStep();

      const { discoveredJobs } = await discoverJobsStep({ mergedConfig });

      const { created } = await importJobsStep({ discoveredJobs });

      await pipelineRepo.updatePipelineRun(pipelineRun.id, {
        jobsDiscovered: created,
      });

      const { unprocessedJobs, scoredJobs } = await scoreJobsStep({ profile });

      const jobsToProcess = selectJobsStep({
        scoredJobs,
        mergedConfig,
      });

      pipelineLogger.info("Selected jobs for processing", {
        candidates: jobsToProcess.length,
      });

      const { processedCount } = await processJobsStep({
        jobsToProcess,
        processJob,
      });

      await pipelineRepo.updatePipelineRun(pipelineRun.id, {
        status: "completed",
        completedAt: new Date().toISOString(),
        jobsProcessed: processedCount,
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
      const message = error instanceof Error ? error.message : "Unknown error";

      await pipelineRepo.updatePipelineRun(pipelineRun.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        errorMessage: message,
      });

      progressHelpers.failed(message);
      pipelineLogger.error("Pipeline run failed", error);

      await notifyPipelineWebhookStep("pipeline.failed", {
        pipelineRunId: pipelineRun.id,
        error: message,
      });

      return {
        success: false,
        jobsDiscovered: 0,
        jobsProcessed: 0,
        error: message,
      };
    } finally {
      isPipelineRunning = false;
    }
  });
}

export type ProcessJobOptions = {
  force?: boolean;
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
          const overrideResumeProjectsRaw = await getSetting("resumeProjects");
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
  _options?: ProcessJobOptions,
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
  return { isRunning: isPipelineRunning };
}
