import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import type { AutoPdfRegenerationReason } from "@server/infra/job-queue";
import { getJobQueue } from "@server/infra/job-queue-registry";
import * as jobsRepo from "@server/repositories/jobs";
import type { SettingKey } from "@server/repositories/settings";
import { getActiveTenantId } from "@server/tenancy/context";
import type { Job } from "@shared/types";
import { generateFinalPdf } from "../pipeline";
import {
  getJobPdfFreshness,
  resolvePdfFingerprintContext,
} from "./pdf-fingerprint";

const AUTO_PDF_REGEN_BATCH_LIMIT = 25;

const SETTINGS_INVALIDATION_KEYS = new Set<SettingKey>([
  "pdfRenderer",
  "rxresumeBaseResumeId",
  "rxresumeUrl",
  "rxresumeApiKey",
]);

let workerPromise: Promise<void> | null = null;
let workerRequested = false;

function scheduleWorker(): void {
  workerRequested = true;
  if (workerPromise) return;
  workerPromise = runWorker().finally(() => {
    workerPromise = null;
    if (workerRequested) {
      scheduleWorker();
    }
  });
}

async function runWorker(): Promise<void> {
  while (workerRequested) {
    workerRequested = false;
    await drainQueue();
  }
}

async function drainQueue(): Promise<void> {
  const queue = getJobQueue();

  while (true) {
    const queuedJob = await queue.reserveNext("auto_pdf_regeneration");
    if (!queuedJob) return;

    try {
      await processQueuedAutoPdfRegeneration(queuedJob.payload);
      await queue.acknowledge(queuedJob.id);
      if (shouldTopUpReadyPdfRegeneration(queuedJob.payload.reason)) {
        await enqueueAutoPdfRegenerationForReadyJobs({
          reason: queuedJob.payload.reason,
          requestedBy: queuedJob.payload.requestedBy,
        });
      }
    } catch (error) {
      logger.warn("Auto PDF regeneration job failed", {
        queue: "auto_pdf_regeneration",
        tenantId: queuedJob.payload.tenantId,
        jobId: queuedJob.payload.jobId,
        reason: queuedJob.payload.reason,
        error,
      });
      await queue.reject(queuedJob.id);
    }
  }
}

function shouldTopUpReadyPdfRegeneration(
  reason: AutoPdfRegenerationReason,
): boolean {
  return reason === "design_resume_updated" || reason === "settings_changed";
}

async function getStaleReadyGeneratedPdfJobs(limit: number): Promise<Job[]> {
  const fingerprintContext = await resolvePdfFingerprintContext();
  const staleJobs: Job[] = [];
  let offset = 0;

  while (staleJobs.length < limit) {
    const page = await jobsRepo.getReadyJobsWithGeneratedPdfs(limit, offset);
    if (page.length === 0) break;

    for (const job of page) {
      if (getJobPdfFreshness(job, fingerprintContext) === "stale") {
        staleJobs.push(job);
        if (staleJobs.length >= limit) break;
      }
    }

    offset += page.length;
    if (page.length < limit) break;
  }

  return staleJobs;
}

async function processQueuedAutoPdfRegeneration(input: {
  tenantId: string;
  jobId: string;
  reason: AutoPdfRegenerationReason;
  requestedAt: string;
  requestedBy: "system" | "user";
}): Promise<void> {
  await runWithRequestContext(
    {
      tenantId: input.tenantId,
      jobId: input.jobId,
    },
    async () => {
      const job = await jobsRepo.getJobById(input.jobId);
      if (!job) {
        logger.info(
          "Skipping auto PDF regeneration because job was not found",
          {
            tenantId: input.tenantId,
            jobId: input.jobId,
            reason: input.reason,
          },
        );
        return;
      }

      if (job.status !== "ready") {
        return;
      }

      if (job.pdfSource !== "generated") {
        return;
      }

      if (job.pdfRegenerating) {
        return;
      }

      const fingerprintContext = await resolvePdfFingerprintContext();
      if (getJobPdfFreshness(job, fingerprintContext) !== "stale") {
        return;
      }

      const result = await generateFinalPdf(job.id, {
        analyticsOrigin: "auto_pdf_regeneration",
      });

      if (!result.success) {
        throw new Error(result.error ?? "Auto PDF regeneration failed.");
      }
    },
  );
}

export async function enqueueAutoPdfRegenerationForJob(input: {
  jobId: string;
  reason: AutoPdfRegenerationReason;
  requestedBy: "system" | "user";
}): Promise<void> {
  const tenantId = getActiveTenantId();
  await getJobQueue().enqueue(
    "auto_pdf_regeneration",
    {
      tenantId,
      jobId: input.jobId,
      reason: input.reason,
      requestedAt: new Date().toISOString(),
      requestedBy: input.requestedBy,
    },
    {
      dedupeKey: `${tenantId}:${input.jobId}`,
    },
  );
  scheduleWorker();
}

export async function enqueueAutoPdfRegenerationForReadyJobs(input: {
  reason: AutoPdfRegenerationReason;
  requestedBy: "system" | "user";
  limit?: number;
}): Promise<number> {
  const limit = Math.max(1, input.limit ?? AUTO_PDF_REGEN_BATCH_LIMIT);
  const jobs = await getStaleReadyGeneratedPdfJobs(limit);

  await Promise.all(
    jobs.map((job) =>
      enqueueAutoPdfRegenerationForJob({
        jobId: job.id,
        reason: input.reason,
        requestedBy: input.requestedBy,
      }),
    ),
  );

  return jobs.length;
}

export async function enqueueAutoPdfRegenerationForSettingsChanges(input: {
  updatedSettingKeys: ReadonlyArray<SettingKey>;
  requestedBy: "system" | "user";
}): Promise<number> {
  const shouldRegenerate = input.updatedSettingKeys.some((key) =>
    SETTINGS_INVALIDATION_KEYS.has(key),
  );
  if (!shouldRegenerate) return 0;

  return enqueueAutoPdfRegenerationForReadyJobs({
    reason: "settings_changed",
    requestedBy: input.requestedBy,
  });
}

export function shouldEnqueueTailoringAutoPdfRegeneration(
  previousJob: Job,
  nextJob: Job,
): boolean {
  if (nextJob.status !== "ready") return false;
  if (nextJob.pdfSource !== "generated") return false;

  return (
    previousJob.tailoredSummary !== nextJob.tailoredSummary ||
    previousJob.tailoredHeadline !== nextJob.tailoredHeadline ||
    previousJob.tailoredSkills !== nextJob.tailoredSkills ||
    previousJob.selectedProjectIds !== nextJob.selectedProjectIds ||
    previousJob.jobDescription !== nextJob.jobDescription ||
    previousJob.tracerLinksEnabled !== nextJob.tracerLinksEnabled ||
    previousJob.employer !== nextJob.employer
  );
}
