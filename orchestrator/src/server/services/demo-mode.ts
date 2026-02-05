import { logger } from "@infra/logger";
import {
  DEMO_BASELINE_VERSION,
  DEMO_BASELINE_NAME,
} from "@server/config/demo-defaults";
import {
  DEMO_RESET_CADENCE_HOURS,
  isDemoMode,
  setDemoResetTimes,
} from "@server/config/demo";
import { applyDemoBaseline, buildDemoBaseline } from "./demo-seed";

const RESET_INTERVAL_MS = DEMO_RESET_CADENCE_HOURS * 60 * 60 * 1000;

let resetTimer: ReturnType<typeof setTimeout> | null = null;
let isResetRunning = false;

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
    logger.error("Failed to reset demo dataset", { error });
    scheduleNextReset();
  } finally {
    isResetRunning = false;
  }
}

export async function initializeDemoModeServices(): Promise<void> {
  if (!isDemoMode()) return;

  await runDemoResetCycle();
  logger.info("Demo mode services initialized", {
    resetCadenceHours: DEMO_RESET_CADENCE_HOURS,
    baselineVersion: DEMO_BASELINE_VERSION,
    baselineName: DEMO_BASELINE_NAME,
  });
}
