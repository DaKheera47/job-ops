import { logger } from "@infra/logger";
import type {
  BatchJobResult,
  LinkedInBatchApplyProgress,
} from "@shared/types";
import * as jobsRepo from "../../repositories/jobs";
import { getProfile } from "../profile";
import { executeEasyApply } from "./easy-apply";
import { randomDelay } from "./human-like";
import {
  loadLinkedInCookies,
  readLinkedInCookieJar,
  saveLinkedInCookies,
} from "./session";

type BatchProgressListener = (progress: LinkedInBatchApplyProgress) => void;

const listeners = new Set<BatchProgressListener>();
let currentProgress: LinkedInBatchApplyProgress = {
  running: false,
  currentIndex: 0,
  totalJobs: 0,
  results: [],
};
let activeAbort: AbortController | null = null;

function emit(update: Partial<LinkedInBatchApplyProgress>): void {
  currentProgress = { ...currentProgress, ...update };
  for (const listener of listeners) {
    try {
      listener(currentProgress);
    } catch {
      // ignore
    }
  }
}

export function subscribeToBatchProgress(
  listener: BatchProgressListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getBatchProgress(): LinkedInBatchApplyProgress {
  return currentProgress;
}

export function cancelBatchApply(): void {
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
}

export function isBatchRunning(): boolean {
  return currentProgress.running;
}

export async function startBatchApply(
  jobIds: string[],
): Promise<void> {
  if (currentProgress.running) {
    throw new Error("Batch apply already running");
  }

  const jobs = await Promise.all(
    jobIds.map((id) => jobsRepo.getJobById(id)),
  );

  const validJobs = jobs.filter(
    (j): j is NonNullable<typeof j> =>
      j !== null &&
      j !== undefined &&
      j.status === "ready" &&
      j.source === "linkedin",
  );

  if (validJobs.length === 0) {
    throw new Error("No valid LinkedIn ready jobs to apply");
  }

  const results: BatchJobResult[] = validJobs.map((j) => ({
    jobId: j.id,
    jobTitle: j.title,
    employer: j.employer,
    status: "pending" as const,
  }));

  activeAbort = new AbortController();

  emit({
    running: true,
    currentIndex: 0,
    totalJobs: validJobs.length,
    results,
  });

  const profile = await getProfile();
  const basics = profile?.basics;

  logger.info("Batch auto-apply started", { total: validJobs.length });

  try {
    for (let i = 0; i < validJobs.length; i++) {
      if (activeAbort?.signal.aborted) {
        logger.info("Batch apply cancelled by user", { completedIndex: i });
        break;
      }

      const job = validJobs[i];
      results[i] = { ...results[i], status: "applying" };
      emit({ currentIndex: i, results: [...results] });

      const jobUrl =
        job.applicationLink || job.jobUrlDirect || job.jobUrl;

      if (!jobUrl) {
        results[i] = {
          ...results[i],
          status: "skipped",
          error: "No application URL",
        };
        emit({ results: [...results] });
        continue;
      }

      try {
        const result = await executeEasyApply({
          jobId: job.id,
          jobUrl,
          pdfPath: job.pdfPath,
          profileName: basics?.name || "",
          profileEmail: basics?.email || "",
          profilePhone: basics?.phone || "",
          autoSubmit: false,
          signal: activeAbort?.signal,
        });

        if (result.success) {
          await jobsRepo.updateJob(job.id, {
            status: "applied",
            appliedAt: new Date().toISOString(),
          });
          results[i] = { ...results[i], status: "applied" };
          if (!currentProgress.viewerUrl && result.viewerUrl) {
            emit({ viewerUrl: result.viewerUrl });
          }
        } else if (result.manualRequired) {
          results[i] = {
            ...results[i],
            status: "manual_required",
            error: "No Easy Apply — apply manually",
          };
        } else {
          results[i] = {
            ...results[i],
            status: "failed",
            error: result.error || "Unknown error",
          };
        }
      } catch (error) {
        results[i] = {
          ...results[i],
          status: "failed",
          error:
            error instanceof Error ? error.message : "Unknown error",
        };
      }

      emit({ results: [...results] });

      // Rate limiting: 45-90 second delay between applications
      if (i < validJobs.length - 1 && !activeAbort?.signal.aborted) {
        await randomDelay(45_000, 90_000);
      }
    }
  } finally {
    activeAbort = null;

    const applied = results.filter((r) => r.status === "applied").length;
    const failed = results.filter((r) => r.status === "failed").length;
    const manual = results.filter(
      (r) => r.status === "manual_required",
    ).length;

    logger.info("Batch auto-apply completed", {
      total: validJobs.length,
      applied,
      failed,
      manual,
    });

    emit({ running: false, results: [...results] });
  }
}
