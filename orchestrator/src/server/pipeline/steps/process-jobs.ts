import { logger } from "@infra/logger";
import { progressHelpers, updateProgress } from "../progress";
import type { ScoredJob } from "./types";

type ProcessJobFn = (
  jobId: string,
  options?: { force?: boolean },
) => Promise<{ success: boolean; error?: string }>;

export async function processJobsStep(args: {
  jobsToProcess: ScoredJob[];
  processJob: ProcessJobFn;
}): Promise<{ processedCount: number }> {
  let processedCount = 0;

  if (args.jobsToProcess.length > 0) {
    updateProgress({
      step: "processing",
      jobsProcessed: 0,
      totalToProcess: args.jobsToProcess.length,
    });

    for (let i = 0; i < args.jobsToProcess.length; i++) {
      const job = args.jobsToProcess[i];
      progressHelpers.processingJob(i + 1, args.jobsToProcess.length, job);

      const result = await args.processJob(job.id, { force: false });

      if (result.success) {
        processedCount++;
      } else {
        logger.warn("Failed to process job", {
          jobId: job.id,
          error: result.error,
        });
      }

      progressHelpers.jobComplete(i + 1, args.jobsToProcess.length);
    }
  }

  return { processedCount };
}
