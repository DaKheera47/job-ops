import { randomUUID } from "node:crypto";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { sanitizeUnknown } from "@infra/sanitize";
import {
  DEMO_RESET_CADENCE_HOURS,
  isDemoMode,
  setDemoResetTimes,
} from "@server/config/demo";
import {
  DEMO_BASELINE_NAME,
  DEMO_BASELINE_VERSION,
} from "@server/config/demo-defaults";
import { discoverJobsStep } from "@server/pipeline/steps/discover-jobs";
import { importJobsStep } from "@server/pipeline/steps/import-jobs";
import * as jobsRepo from "@server/repositories/jobs";
import { DEFAULT_TENANT_ID } from "@server/tenancy/constants";
import { createLocationIntentFromLegacyInputs } from "@shared/location-domain.js";
import {
  applyDemoBaseline,
  buildDemoBaseline,
  DEMO_LIVE_JOB_SOURCES,
} from "./demo-seed";

const RESET_INTERVAL_MS = DEMO_RESET_CADENCE_HOURS * 60 * 60 * 1000;
const JOB_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const JOB_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ponytail: demo hosting is single-process; use a distributed scheduler if it gains replicas.
let resetTimer: ReturnType<typeof setTimeout> | null = null;
let jobRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let isResetRunning = false;
let isJobRefreshRunning = false;

function computeNextReset(now: Date): Date {
  return new Date(now.getTime() + RESET_INTERVAL_MS);
}

function scheduleNextReset(): void {
  const now = new Date();
  const nextReset = computeNextReset(now);
  const delay = nextReset.getTime() - now.getTime();
  setDemoResetTimes({ nextResetAt: nextReset.toISOString() });

  if (resetTimer) clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    void runDemoResetCycle();
  }, delay);
}

function scheduleNextJobRefresh(): void {
  if (jobRefreshTimer) clearTimeout(jobRefreshTimer);
  jobRefreshTimer = setTimeout(() => {
    void runDemoJobRefreshCycle();
  }, JOB_REFRESH_INTERVAL_MS);
}

export async function resetDemoData(): Promise<void> {
  const baseline = buildDemoBaseline(new Date());
  await applyDemoBaseline(baseline);
}

export async function runDemoResetCycle(): Promise<void> {
  if (isResetRunning) return;
  isResetRunning = true;

  try {
    await resetDemoData();
    const nowIso = new Date().toISOString();
    setDemoResetTimes({ lastResetAt: nowIso });
    scheduleNextReset();
    logger.info("Demo dataset reset completed", {
      lastResetAt: nowIso,
      baselineVersion: DEMO_BASELINE_VERSION,
    });
  } catch (error) {
    logger.error("Failed to reset demo dataset", {
      error: sanitizeUnknown(error),
    });
    scheduleNextReset();
  } finally {
    isResetRunning = false;
  }
}

export async function refreshDemoJobs(now = new Date()): Promise<{
  jobsDiscovered: number;
  jobsImported: number;
  jobsDeleted: number;
}> {
  let jobsDiscovered = 0;
  let jobsImported = 0;
  let jobsDeleted = 0;

  try {
    const discovery = await discoverJobsStep({
      mergedConfig: {
        sources: [...DEMO_LIVE_JOB_SOURCES],
        locationIntent: createLocationIntentFromLegacyInputs({
          selectedCountry: "US",
        }),
      },
      includeWatchlist: false,
    });
    jobsDiscovered = discovery.discoveredJobs.length;
    jobsImported = (
      await importJobsStep({ discoveredJobs: discovery.discoveredJobs })
    ).created;

    if (
      discovery.sourceErrors.length > 0 ||
      discovery.pendingChallenges.length > 0
    ) {
      logger.warn("Demo job refresh completed with source issues", {
        sourceErrors: sanitizeUnknown(discovery.sourceErrors),
        challengedSources: discovery.pendingChallenges.flatMap(
          (challenge) => challenge.sources,
        ),
      });
    }
  } finally {
    const cutoff = new Date(now.getTime() - JOB_RETENTION_MS);
    jobsDeleted = await jobsRepo.deleteJobsOlderThan(cutoff);
    logger.info("Demo job refresh completed", {
      sources: DEMO_LIVE_JOB_SOURCES,
      country: "US",
      jobsDiscovered,
      jobsImported,
      jobsDeleted,
      retentionDays: 30,
    });
  }

  return { jobsDiscovered, jobsImported, jobsDeleted };
}

export async function runDemoJobRefreshCycle(): Promise<void> {
  if (isJobRefreshRunning) return;
  isJobRefreshRunning = true;

  try {
    await runWithRequestContext(
      {
        requestId: `demo-job-refresh-${randomUUID()}`,
        tenantId: DEFAULT_TENANT_ID,
      },
      () => refreshDemoJobs(),
    );
  } catch (error) {
    logger.error("Failed to refresh demo jobs", {
      error: sanitizeUnknown(error),
    });
  } finally {
    isJobRefreshRunning = false;
    scheduleNextJobRefresh();
  }
}

export async function initializeDemoModeServices(): Promise<void> {
  if (!isDemoMode()) return;

  await runDemoResetCycle();
  await runDemoJobRefreshCycle();
  logger.info("Demo mode services initialized", {
    resetCadenceHours: DEMO_RESET_CADENCE_HOURS,
    jobRefreshCadenceHours: 24,
    baselineVersion: DEMO_BASELINE_VERSION,
    baselineName: DEMO_BASELINE_NAME,
  });
}
