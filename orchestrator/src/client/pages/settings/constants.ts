/**
 * Settings page constants.
 */

import type { JobStatus } from "@shared/types";

/** All available job statuses for clearing */
export const ALL_JOB_STATUSES: JobStatus[] = [
  "discovered",
  "processing",
  "ready",
  "applied",
  "skipped",
  "expired",
];

/** Status descriptions for UI */
export const STATUS_DESCRIPTIONS: Record<JobStatus, string> = {
  discovered: "Crawled but not processed",
  processing: "Currently generating resume",
  ready: "PDF generated, waiting for user to apply",
  applied: "User marked as applied",
  skipped: "User skipped this job",
  expired: "Deadline passed",
};
