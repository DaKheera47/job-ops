import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import type { CreateJobInput } from "@shared/types";
import { progressHelpers } from "../progress";

export async function importJobsStep(args: {
  discoveredJobs: CreateJobInput[];
}): Promise<{ created: number; skipped: number }> {
  logger.info("Importing discovered jobs", {
    discovered: args.discoveredJobs.length,
  });
  const { created, skipped } = await jobsRepo.createJobs(args.discoveredJobs);
  logger.info("Import step complete", {
    discovered: args.discoveredJobs.length,
    created,
    skipped,
  });

  progressHelpers.importComplete(created, skipped);

  return { created, skipped };
}
