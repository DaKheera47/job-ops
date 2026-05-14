import { logger } from "@infra/logger";
import { asyncPool } from "@server/utils/async-pool";
import type { CreateJobInput } from "@shared/types";

/**
 * Pre-import liveness check — drops obviously-dead URLs *before* they hit the
 * jobs table.  Career-ops calls this "verify before queue": stops you from
 * paying scoring tokens on Google-cached 404s and from cluttering the job list
 * with rotted listings.
 *
 * Strategy:
 *   - Skip manual jobs (URLs the user typed).
 *   - Issue a single GET with a short timeout.
 *   - If we get an unambiguous 404/410 we drop the job.
 *   - On any other condition (timeout, 5xx, network error, 200, 403, …) we
 *     keep the job and let the existing post-import liveness step (which
 *     handles body classification) decide.
 */

const REQUEST_TIMEOUT_MS = 4000;
const CONCURRENCY = 8;

const liveLogger = logger.child({ module: "pre-import-liveness" });

async function isObviouslyDead(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        accept: "text/html",
        "user-agent": "Mozilla/5.0 (compatible; JobOpsLivenessBot/1.0)",
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      redirect: "follow",
    });
    return resp.status === 404 || resp.status === 410;
  } catch {
    return false;
  }
}

export interface PreImportLivenessResult {
  liveJobs: CreateJobInput[];
  filteredCount: number;
}

export async function preImportLivenessStep(args: {
  discoveredJobs: CreateJobInput[];
  shouldCancel?: () => boolean;
}): Promise<PreImportLivenessResult> {
  if (args.discoveredJobs.length === 0) {
    return { liveJobs: [], filteredCount: 0 };
  }

  const checkable = args.discoveredJobs.filter(
    (job) => job.source !== "manual" && job.jobUrl,
  );
  const skipped = args.discoveredJobs.filter(
    (job) => job.source === "manual" || !job.jobUrl,
  );

  if (checkable.length === 0) {
    return { liveJobs: args.discoveredJobs, filteredCount: 0 };
  }

  liveLogger.info("Starting pre-import liveness check", {
    candidates: checkable.length,
    skipped: skipped.length,
  });

  const deadIndices = new Set<number>();
  await asyncPool({
    items: checkable,
    concurrency: CONCURRENCY,
    shouldStop: args.shouldCancel,
    task: async (job, index) => {
      const dead = await isObviouslyDead(job.jobUrl);
      if (dead) {
        deadIndices.add(index);
        liveLogger.info("Pre-import: dropping obviously-dead URL", {
          jobUrl: job.jobUrl,
          source: job.source,
        });
      }
    },
  });

  const liveJobs = checkable.filter((_job, idx) => !deadIndices.has(idx));
  liveLogger.info("Pre-import liveness check complete", {
    candidates: checkable.length,
    filtered: deadIndices.size,
    kept: liveJobs.length,
  });

  return {
    liveJobs: [...liveJobs, ...skipped],
    filteredCount: deadIndices.size,
  };
}
