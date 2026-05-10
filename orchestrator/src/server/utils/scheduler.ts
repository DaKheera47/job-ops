/**
 * Shared daily scheduler utility for running tasks at a specific hour.
 * Used by visa-sponsors, backup, and pipeline services.
 */

export interface Scheduler {
  /** Start scheduling at the specified hour (0-23). */
  start(hour: number, timezone?: string): void;
  /** Stop the scheduler */
  stop(): void;
  /** Get ISO string of next scheduled run, or null if not running */
  getNextRun(): string | null;
  /** Check if scheduler is currently running */
  isRunning(): boolean;
}

interface SchedulerState {
  timer: ReturnType<typeof setTimeout> | null;
  nextRunTime: Date | null;
  currentHour: number | null;
  currentTimezone: string | null;
}

/**
 * Compute the UTC offset (in ms) for an absolute instant in a given IANA
 * timezone. Used to convert local-wall-clock to UTC and back without a
 * library, while respecting DST transitions for that exact instant.
 */
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

/**
 * Resolve a wall-clock time (year/month/day/hour in `timeZone`) to the
 * corresponding UTC instant. Handles DST transitions correctly.
 */
function zonedWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  timeZone: string,
): Date {
  // Initial guess assumes no offset; correct iteratively (one pass is
  // enough for any normal offset including DST transitions).
  const guess = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  const offset = getTimezoneOffsetMs(guess, timeZone);
  return new Date(guess.getTime() - offset);
}

/**
 * Calculate the next occurrence of a specific hour, optionally interpreted
 * in a given IANA timezone (e.g. "Europe/Berlin"). When `timezone` is
 * omitted the hour is treated as UTC, matching the legacy behaviour used
 * by visa-sponsors and backup schedulers.
 */
export function calculateNextTime(hour: number, timezone?: string): Date {
  const now = new Date();

  if (!timezone) {
    const next = new Date(now);
    next.setUTCHours(hour, 0, 0, 0);
    if (next <= now) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    return next;
  }

  // Walk forward day-by-day in the target timezone until we find an
  // occurrence strictly in the future. Two iterations are always enough.
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
  // Defensive fallback (should never hit).
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

/**
 * Create a reusable daily scheduler
 * @param name - Service name for logging
 * @param callback - Async function to execute at scheduled time
 * @returns Scheduler interface with start/stop/getNextRun methods
 */
export function createScheduler(
  name: string,
  callback: () => Promise<void>,
): Scheduler {
  const state: SchedulerState = {
    timer: null,
    nextRunTime: null,
    currentHour: null,
    currentTimezone: null,
  };

  function clearState(): void {
    if (state.timer) {
      clearTimeout(state.timer);
    }
    state.timer = null;
    state.nextRunTime = null;
    state.currentHour = null;
    state.currentTimezone = null;
  }

  function scheduleNext(hour: number, timezone: string | undefined): void {
    if (state.timer) {
      clearState();
    }

    state.currentHour = hour;
    state.currentTimezone = timezone ?? null;
    state.nextRunTime = calculateNextTime(hour, timezone);
    const delay = state.nextRunTime.getTime() - Date.now();

    console.log(
      `⏰ [${name}] Next run scheduled for: ${state.nextRunTime.toISOString()}${
        timezone ? ` (${hour}:00 ${timezone})` : ""
      }`,
    );

    state.timer = setTimeout(async () => {
      console.log(`🔄 [${name}] Running scheduled task...`);
      try {
        await callback();
      } catch (error) {
        console.error(`❌ [${name}] Scheduled task failed:`, error);
      }
      // Reschedule for next occurrence
      scheduleNext(hour, timezone);
    }, delay);
  }

  return {
    start(hour: number, timezone?: string): void {
      if (state.timer) {
        console.log(`🔄 [${name}] Restarting scheduler with hour ${hour}...`);
        clearState();
      } else {
        console.log(`🚀 [${name}] Starting scheduler at hour ${hour}...`);
      }
      scheduleNext(hour, timezone);
    },

    stop(): void {
      if (state.timer) {
        clearState();
        console.log(`⏹️ [${name}] Stopped scheduler`);
      }
    },

    getNextRun(): string | null {
      return state.nextRunTime?.toISOString() || null;
    },

    isRunning(): boolean {
      return state.timer !== null;
    },
  };
}
