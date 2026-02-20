import type { JobActionResponse, JobListItem } from "@shared/types";

const SKIPPABLE_STATUSES = new Set(["discovered", "ready"]);

export function canBulkSkip(jobs: JobListItem[]): boolean {
  return (
    jobs.length > 0 && jobs.every((job) => SKIPPABLE_STATUSES.has(job.status))
  );
}

export function canBulkMoveToReady(jobs: JobListItem[]): boolean {
  return jobs.length > 0 && jobs.every((job) => job.status === "discovered");
}

export function canBulkRescore(jobs: JobListItem[]): boolean {
  return jobs.length > 0 && jobs.every((job) => job.status !== "processing");
}

export function getFailedJobIds(response: JobActionResponse): Set<string> {
  const failedIds = response.results
    .filter((result) => !result.ok)
    .map((result) => result.jobId);
  return new Set(failedIds);
}
