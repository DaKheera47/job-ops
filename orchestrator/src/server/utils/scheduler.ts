/**
 * Shared daily scheduler utility for running tasks at a specific hour.
 * Used by visa-sponsors and backup services.
 */

export interface Scheduler {
  /** Start scheduling at the specified hour (0-23) */
  start(hour: number): void;
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
}

/**
 * Calculate the next occurrence of a specific hour
 * @param hour - Hour of day (0-23)
 * @returns Date object set to the next occurrence of that hour
 */
export function calculateNextTime(hour: number): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);

  // If we've passed the time today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next;
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
  };

  function scheduleNext(hour: number): void {
    // Clear any existing timer
    if (state.timer) {
      clearTimeout(state.timer);
    }

    state.currentHour = hour;
    state.nextRunTime = calculateNextTime(hour);
    const delay = state.nextRunTime.getTime() - Date.now();

    console.log(
      `⏰ [${name}] Next run scheduled for: ${state.nextRunTime.toISOString()}`,
    );

    state.timer = setTimeout(async () => {
      console.log(`🔄 [${name}] Running scheduled task...`);
      try {
        await callback();
      } catch (error) {
        console.error(`❌ [${name}] Scheduled task failed:`, error);
      }
      // Reschedule for next occurrence
      scheduleNext(hour);
    }, delay);
  }

  return {
    start(hour: number): void {
      if (state.timer) {
        console.log(`🔄 [${name}] Restarting scheduler with hour ${hour}...`);
        stop();
      } else {
        console.log(`🚀 [${name}] Starting scheduler at hour ${hour}...`);
      }
      scheduleNext(hour);
    },

    stop(): void {
      if (state.timer) {
        clearTimeout(state.timer);
        state.timer = null;
        state.nextRunTime = null;
        state.currentHour = null;
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

  function stop(): void {
    if (state.timer) {
      clearTimeout(state.timer);
      state.timer = null;
      state.nextRunTime = null;
      state.currentHour = null;
    }
  }
}
