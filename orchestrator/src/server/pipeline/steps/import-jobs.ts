import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import { deduplicateJobsByTitleAndEmployer } from "@shared/job-matching.js";
import type { CreateJobInput } from "@shared/types";
import { progressHelpers } from "../progress";

export async function importJobsStep(args: {
  discoveredJobs: CreateJobInput[];
}): Promise<{ created: number; skipped: number; fuzzyMerged: number }> {
  logger.info("Importing discovered jobs", {
    discovered: args.discoveredJobs.length,
  });

  const dedupedJobs = deduplicateJobsByTitleAndEmployer(args.discoveredJobs);
  const fuzzyMerged = args.discoveredJobs.length - dedupedJobs.length;

  if (fuzzyMerged > 0) {
    logger.info("Fuzzy-deduped discovered jobs before import", {
      original: args.discoveredJobs.length,
      dedupedCount: dedupedJobs.length,
      fuzzyMerged,
    });
  }

  const { created, skipped } = await jobsRepo.createJobs(dedupedJobs);
  logger.info("Import step complete", {
    discovered: args.discoveredJobs.length,
    fuzzyMerged,
    created,
    skipped,
  });

  progressHelpers.importComplete(created, skipped + fuzzyMerged);

  return { created, skipped, fuzzyMerged };
}
