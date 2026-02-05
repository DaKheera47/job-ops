import { logger } from "@infra/logger";
import type { CreateJobInput } from "@shared/types";
import * as jobsRepo from "../../repositories/jobs";
import { progressHelpers } from "../progress";

export async function importJobsStep(args: {
  discoveredJobs: CreateJobInput[];
}): Promise<{ created: number; skipped: number }> {
  logger.info("Importing discovered jobs");
  const { created, skipped } = await jobsRepo.bulkCreateJobs(
    args.discoveredJobs,
  );
  logger.info("Import step complete", { created, skipped });

  progressHelpers.importComplete(created, skipped);

  return { created, skipped };
}
