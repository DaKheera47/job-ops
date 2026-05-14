/**
 * Stale job cleanup scheduler.
 *
 * Runs daily at 3 AM and removes jobs that:
 *   - have not been updated in more than STALE_JOB_DAYS days
 *   - are in a safe-to-prune status: discovered, skipped, or expired
 *
 * Jobs with status applied, in_progress, or ready are NEVER auto-deleted.
 *
 * This prevents uncontrolled DB growth from accumulating useless discovered/
 * skipped/expired records over time.
 */

import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { deleteStaleJobs } from "../repositories/jobs";
import { createScheduler } from "../utils/scheduler";

const STALE_JOB_DAYS = 90;
const CLEANUP_HOUR_UTC = 3;

export const staleJobsCleanupScheduler = createScheduler(
  "stale-jobs-cleanup",
  async () => {
    try {
      const deleted = await deleteStaleJobs(STALE_JOB_DAYS);
      if (deleted > 0) {
        logger.info("Stale job cleanup completed", {
          deleted,
          olderThanDays: STALE_JOB_DAYS,
        });
      } else {
        logger.debug("Stale job cleanup: no stale jobs found", {
          olderThanDays: STALE_JOB_DAYS,
        });
      }
    } catch (err) {
      logger.error("Stale job cleanup failed", {
        error: sanitizeUnknown(err),
        olderThanDays: STALE_JOB_DAYS,
      });
    }
  },
);

export function initializeStaleJobsCleanup(): void {
  staleJobsCleanupScheduler.start(CLEANUP_HOUR_UTC);
  logger.info("Stale job cleanup scheduler started", {
    hourUtc: CLEANUP_HOUR_UTC,
    olderThanDays: STALE_JOB_DAYS,
    nextRun: staleJobsCleanupScheduler.getNextRun(),
  });
}
