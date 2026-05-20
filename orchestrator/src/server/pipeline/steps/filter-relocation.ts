import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import { buildRelocationFilterConfigFromSettings } from "@server/services/relocation-filter-config";
import {
  RELOCATION_SKIP_REASON,
  requiresRelocation,
} from "@server/services/relocation-filter";

/**
 * Auto-skip discovered jobs whose location implies relocation outside the
 * candidate's home region.
 *
 * Runs after import + before scoring so we don't waste LLM tokens on
 * listings the user would never apply to.  Marks them as `skipped` (not
 * deleted) with a clear reason so they remain visible in "All Jobs" if
 * the user wants to inspect them.
 *
 * The home-city + accessible-region lists come from the user's settings
 * (`relocationHomeCities`, `relocationAccessibleRegions`) — the predicate
 * has no hardcoded user data.  Never demotes anything outside `discovered`.
 */
export async function filterRelocationJobsStep(): Promise<{
  markedCount: number;
}> {
  const discovered = await jobsRepo.getUnscoredDiscoveredJobs();
  if (discovered.length === 0) return { markedCount: 0 };

  const config = await buildRelocationFilterConfigFromSettings();

  const toSkip = discovered.filter((job) => requiresRelocation(job, config));
  if (toSkip.length === 0) {
    logger.info("Relocation filter: no discovered jobs require relocation", {
      candidates: discovered.length,
      homeCities: config.homeCities.length,
      accessibleRegions: config.accessibleRegions.length,
    });
    return { markedCount: 0 };
  }

  const marked = await jobsRepo.markJobsSkippedWithReason(
    toSkip.map((j) => j.id),
    RELOCATION_SKIP_REASON,
  );
  logger.info("Relocation filter: auto-skipped jobs outside home region", {
    candidates: discovered.length,
    marked,
  });
  return { markedCount: marked };
}
