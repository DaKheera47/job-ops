/**
 * Pipeline scheduler — fires the daily run at the user-configured hour in
 * their local timezone.
 *
 * Architecture: a minute-by-minute tick instead of one big setTimeout.
 *
 * Why: setTimeout(longDelay) is fragile in containers — it doesn't survive
 * Docker pause/resume, the host going to sleep, or wall-clock changes.
 * We also miss the firing window entirely if the container was down at
 * exactly the scheduled time.
 *
 * The tick approach is naturally idempotent and self-healing:
 *   - Every minute we check "should this slot have fired by now?"
 *   - We anchor "fired today" to `pipeline_runs.started_at` so a server
 *     restart in the middle of the day doesn't re-trigger a run that has
 *     already happened.
 *   - If we miss the scheduled minute (e.g. container down), the next tick
 *     after the schedule time still picks it up — within 60 s.
 *
 * For backups and visa-sponsor refresh we keep the shared `Scheduler`
 * abstraction (different reliability needs — those are cheap idempotent
 * jobs).  This module owns the pipeline-specific lifecycle.
 */

import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { runPipeline } from "../pipeline/orchestrator";
import { getLatestPipelineRun } from "../repositories/pipeline";
import * as settingsRepo from "../repositories/settings";

const TICK_INTERVAL_MS = 60_000;

interface SchedulerState {
  /** Periodic check timer.  Null when scheduler is off. */
  interval: ReturnType<typeof setInterval> | null;
  /** True while a tick is mid-execution (prevents reentrancy). */
  tickInFlight: boolean;
  /** True while runPipeline() is mid-execution (prevents accidental double-fire). */
  runInFlight: boolean;
  /** ISO timestamp of the next expected firing (informational only). */
  nextFireAt: string | null;
  /** User-configured firing hour 0-23 in the configured timezone. */
  configuredHour: number | null;
  /** IANA timezone of the configured hour. */
  configuredTimezone: string | null;
}

const state: SchedulerState = {
  interval: null,
  tickInFlight: false,
  runInFlight: false,
  nextFireAt: null,
  configuredHour: null,
  configuredTimezone: null,
};

// ---------- Time helpers (mirrors utils/scheduler.ts) ----------

function getTimezoneOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const asIfUtc = Date.UTC(
    parseInt(map.year, 10),
    parseInt(map.month, 10) - 1,
    parseInt(map.day, 10),
    parseInt(map.hour, 10),
    parseInt(map.minute, 10),
    parseInt(map.second, 10),
  );
  return asIfUtc - date.getTime();
}

function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const offset = getTimezoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

/** Today's firing instant in UTC for the configured hour in the configured tz. */
function todaysFireInstant(now: Date, hour: number, timezone: string): Date {
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
  return zonedWallTimeToUtc(y, m, d, hour, timezone);
}

function nextFireInstantAfter(
  now: Date,
  hour: number,
  timezone: string,
): Date {
  // Walk forward day-by-day until we find a fire instant strictly in the future.
  for (let dayOffset = 0; dayOffset < 3; dayOffset++) {
    const probe = new Date(now.getTime() + dayOffset * 24 * 60 * 60 * 1000);
    const dateStr = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(probe);
    const [y, m, d] = dateStr.split("-").map((s) => parseInt(s, 10));
    const candidate = zonedWallTimeToUtc(y, m, d, hour, timezone);
    if (candidate > now) return candidate;
  }
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

// ---------- Main loop ----------

async function tick(): Promise<void> {
  if (state.tickInFlight) return;
  state.tickInFlight = true;
  try {
    const hour = state.configuredHour;
    const timezone = state.configuredTimezone;
    if (hour === null || !timezone) return;

    const now = new Date();
    const todaysFireAt = todaysFireInstant(now, hour, timezone);

    // Refresh the "informational" nextFireAt for /pipeline status callers.
    state.nextFireAt = nextFireInstantAfter(now, hour, timezone).toISOString();

    // Are we past today's firing instant?
    if (now < todaysFireAt) return;

    // Have we already fired today?  Anchor to the latest pipeline run started
    // at or after today's firing instant — that's the most robust signal and
    // it survives restarts (the DB row outlives any in-memory flag).
    const latestRun = await getLatestPipelineRun();
    if (latestRun) {
      const lastStartedAt = new Date(latestRun.startedAt);
      if (lastStartedAt >= todaysFireAt) {
        // Already fired today — nothing to do.
        return;
      }
    }

    // Avoid stacking runs if a previous tick is still inside runPipeline.
    if (state.runInFlight) {
      logger.debug("Pipeline scheduler tick skipped: run already in flight");
      return;
    }

    state.runInFlight = true;
    logger.info("Pipeline scheduler firing scheduled run", {
      scheduledFor: todaysFireAt.toISOString(),
      actualFireAt: now.toISOString(),
      driftMs: now.getTime() - todaysFireAt.getTime(),
    });

    try {
      const topN = parseInt(
        (await settingsRepo.getSetting("pipelineTopN")) || "10",
        10,
      );
      const minScore = parseInt(
        (await settingsRepo.getSetting("pipelineMinScore")) || "50",
        10,
      );

      await runWithRequestContext({ pipelineRunId: "scheduled" }, async () => {
        const result = await runPipeline({
          topN: Number.isNaN(topN) ? 10 : topN,
          minSuitabilityScore: Number.isNaN(minScore) ? 50 : minScore,
        });
        if (result.success) {
          logger.info("Scheduled pipeline completed", {
            jobsDiscovered: result.jobsDiscovered,
            jobsProcessed: result.jobsProcessed,
          });
        } else {
          logger.warn("Scheduled pipeline failed", { error: result.error });
        }
      });
    } catch (err) {
      logger.error("Scheduled pipeline threw", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      state.runInFlight = false;
    }
  } catch (err) {
    logger.error("Pipeline scheduler tick failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    state.tickInFlight = false;
  }
}

function clearTick(): void {
  if (state.interval) {
    clearInterval(state.interval);
    state.interval = null;
  }
}

export async function initializePipelineScheduler(): Promise<void> {
  const enabled = await settingsRepo.getSetting("pipelineScheduleEnabled");
  const hourRaw = await settingsRepo.getSetting("pipelineScheduleHour");
  const hour = parseInt(hourRaw || "8", 10);
  const safeHour = Number.isNaN(hour) ? 8 : Math.min(23, Math.max(0, hour));
  const userTimezone =
    (await settingsRepo.getSetting("userTimezone")) || "Europe/Berlin";

  state.configuredHour = safeHour;
  state.configuredTimezone = userTimezone;

  if (enabled === "true" || enabled === "1") {
    if (state.interval) {
      clearTick();
    }
    // Compute first "next fire" for status display + log it.
    const next = nextFireInstantAfter(new Date(), safeHour, userTimezone);
    state.nextFireAt = next.toISOString();

    // Periodic check.  First tick is deferred to avoid a thundering "fire on
    // boot" if we restart shortly after the scheduled time (the tick itself
    // checks the DB anchor so it's idempotent, but we don't want lots of
    // boot-time work).  Subsequent ticks happen every minute.
    state.interval = setInterval(() => {
      void tick();
    }, TICK_INTERVAL_MS);

    // First check after 30s so initialization noise settles.
    setTimeout(() => {
      void tick();
    }, 30_000);

    logger.info("Pipeline scheduler started", {
      hour: safeHour,
      timezone: userTimezone,
      nextFireAt: state.nextFireAt,
      tickEveryMs: TICK_INTERVAL_MS,
    });
  } else {
    clearTick();
    state.nextFireAt = null;
    logger.info("Pipeline scheduler disabled");
  }
}

export function getPipelineSchedulerStatus(): {
  enabled: boolean;
  nextRun: string | null;
} {
  return {
    enabled: state.interval !== null,
    nextRun: state.nextFireAt,
  };
}
