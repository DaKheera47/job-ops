import type { BulkJobActionResponse, Job } from "@shared/types";

const SKIPPABLE_STATUSES = new Set(["discovered", "ready"]);

export function canBulkSkip(jobs: Job[]): boolean {
  return (
    jobs.length > 0 && jobs.every((job) => SKIPPABLE_STATUSES.has(job.status))
  );
}

export function canBulkMoveToReady(jobs: Job[]): boolean {
  return jobs.length > 0 && jobs.every((job) => job.status === "discovered");
}

export function getFailedJobIds(response: BulkJobActionResponse): Set<string> {
  const failedIds = response.results
    .filter((result) => !result.ok)
    .map((result) => result.jobId);
  return new Set(failedIds);
}
