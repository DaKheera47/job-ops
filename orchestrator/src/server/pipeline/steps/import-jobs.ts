import type { CreateJobInput } from "@shared/types";
import * as jobsRepo from "../../repositories/jobs";
import { progressHelpers } from "../progress";

export async function importJobsStep(args: {
  discoveredJobs: CreateJobInput[];
}): Promise<{ created: number; skipped: number }> {
  console.log("\n💾 Importing jobs to database...");
  const { created, skipped } = await jobsRepo.bulkCreateJobs(
    args.discoveredJobs,
  );
  console.log(`   Created: ${created}, Skipped (duplicates): ${skipped}`);

  progressHelpers.importComplete(created, skipped);

  return { created, skipped };
}
