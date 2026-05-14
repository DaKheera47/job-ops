/**
 * Gmail auto-sync scheduler — polls every connected Gmail account on a
 * fixed interval (default: 2 hours) and runs the post-application ingestion
 * pipeline for each.
 *
 * The scheduler is built to be reliable above all else:
 *   - Skips if any sync run is already in flight (idempotent under server
 *     reload + manual triggers).
 *   - Tracks consecutive failures per account and emits a health-alert event
 *     after three in a row so we can surface "Reconnect Gmail" in chat.
 *   - Survives transient network/Gmail errors — the next tick will retry.
 */

import { EventEmitter } from "node:events";
import { logger } from "@infra/logger";
import { runWithRequestContext } from "@infra/request-context";
import { listConnectedPostApplicationIntegrations } from "../repositories/post-application-integrations";
import * as settingsRepo from "../repositories/settings";
import {
  type GmailSyncSummary,
  runGmailIngestionSync,
} from "./post-application/ingestion/gmail-sync";

const MS_PER_HOUR = 60 * 60 * 1000;
const DEFAULT_INTERVAL_HOURS = 2;
const FAILURE_ALERT_THRESHOLD = 3;

type AccountKey = string;

interface SchedulerState {
  timer: ReturnType<typeof setInterval> | null;
  intervalMs: number | null;
  lastTickStartedAt: number | null;
  lastTickCompletedAt: number | null;
  inFlight: boolean;
  consecutiveFailures: Map<AccountKey, number>;
}

const state: SchedulerState = {
  timer: null,
  intervalMs: null,
  lastTickStartedAt: null,
  lastTickCompletedAt: null,
  inFlight: false,
  consecutiveFailures: new Map(),
};

export type GmailSyncHealthEvent =
  | {
      type: "tick_started";
      accountCount: number;
      startedAt: number;
    }
  | {
      type: "account_synced";
      accountKey: AccountKey;
      summary: GmailSyncSummary;
      durationMs: number;
    }
  | {
      type: "account_failed";
      accountKey: AccountKey;
      error: string;
      consecutiveFailures: number;
      shouldAlertUser: boolean;
    }
  | {
      type: "tick_completed";
      durationMs: number;
      totals: GmailSyncSummary;
      accountCount: number;
    }
  | {
      type: "no_accounts_connected";
    };

const healthEvents = new EventEmitter();
healthEvents.setMaxListeners(20);

export function subscribeToGmailSyncHealth(
  listener: (event: GmailSyncHealthEvent) => void,
): () => void {
  healthEvents.on("event", listener);
  return () => healthEvents.off("event", listener);
}

function emit(event: GmailSyncHealthEvent): void {
  try {
    healthEvents.emit("event", event);
  } catch (err) {
    logger.warn("Gmail sync health listener threw", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function readIntervalMs(): Promise<number> {
  const raw = await settingsRepo.getSetting("gmailSyncIntervalHours");
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  const safeHours = Number.isFinite(parsed)
    ? Math.min(24, Math.max(1, parsed))
    : DEFAULT_INTERVAL_HOURS;
  return safeHours * MS_PER_HOUR;
}

async function readEnabled(): Promise<boolean> {
  const raw = await settingsRepo.getSetting("gmailSyncEnabled");
  if (raw === null || raw === undefined) return true; // default-on
  return raw === "true" || raw === "1";
}

/**
 * Run the sync for every connected Gmail account.  Called both by the timer
 * and by manual triggers (e.g. /sync command in Telegram).  Returns the
 * combined summary so the caller can show "synced N messages" feedback.
 */
export async function runGmailSyncForAllAccounts(args?: {
  reason?: "scheduled" | "manual";
}): Promise<{
  ranAccounts: number;
  totals: GmailSyncSummary;
}> {
  if (state.inFlight) {
    logger.info("Gmail sync skipped: already in flight", {
      reason: args?.reason,
    });
    return {
      ranAccounts: 0,
      totals: { discovered: 0, relevant: 0, classified: 0, errored: 0 },
    };
  }

  state.inFlight = true;
  state.lastTickStartedAt = Date.now();

  const totals: GmailSyncSummary = {
    discovered: 0,
    relevant: 0,
    classified: 0,
    errored: 0,
  };

  try {
    const integrations =
      await listConnectedPostApplicationIntegrations("gmail");

    if (integrations.length === 0) {
      emit({ type: "no_accounts_connected" });
      return { ranAccounts: 0, totals };
    }

    emit({
      type: "tick_started",
      accountCount: integrations.length,
      startedAt: state.lastTickStartedAt,
    });

    for (const integration of integrations) {
      const accountKey = integration.accountKey;
      const accountStartedAt = Date.now();
      try {
        const summary = await runWithRequestContext({}, async () =>
          runGmailIngestionSync({
            accountKey,
          }),
        );
        totals.discovered += summary.discovered;
        totals.relevant += summary.relevant;
        totals.classified += summary.classified;
        totals.errored += summary.errored;
        state.consecutiveFailures.delete(accountKey);
        emit({
          type: "account_synced",
          accountKey,
          summary,
          durationMs: Date.now() - accountStartedAt,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        const failures =
          (state.consecutiveFailures.get(accountKey) ?? 0) + 1;
        state.consecutiveFailures.set(accountKey, failures);
        const shouldAlertUser = failures === FAILURE_ALERT_THRESHOLD;
        emit({
          type: "account_failed",
          accountKey,
          error: message,
          consecutiveFailures: failures,
          shouldAlertUser,
        });
        logger.warn("Gmail sync failed for account", {
          accountKey,
          consecutiveFailures: failures,
          error: message,
        });
      }
    }

    emit({
      type: "tick_completed",
      durationMs: Date.now() - state.lastTickStartedAt,
      totals,
      accountCount: integrations.length,
    });

    return { ranAccounts: integrations.length, totals };
  } finally {
    state.inFlight = false;
    state.lastTickCompletedAt = Date.now();
  }
}

function clearTimer(): void {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  state.intervalMs = null;
}

async function tick(): Promise<void> {
  try {
    await runGmailSyncForAllAccounts({ reason: "scheduled" });
  } catch (error) {
    logger.error("Gmail sync tick failed unexpectedly", { error });
  }
}

/**
 * Start (or restart) the Gmail sync scheduler.  Safe to call repeatedly —
 * it will tear down the existing timer before starting a new one whenever
 * the interval changes.
 */
export async function initializeGmailSyncScheduler(): Promise<void> {
  const enabled = await readEnabled();
  if (!enabled) {
    clearTimer();
    logger.info("Gmail sync scheduler disabled by settings");
    return;
  }

  const intervalMs = await readIntervalMs();
  if (state.timer && state.intervalMs === intervalMs) {
    // Already running at the right cadence; nothing to do.
    return;
  }

  clearTimer();
  state.intervalMs = intervalMs;
  state.timer = setInterval(() => {
    void tick();
  }, intervalMs);
  logger.info("Gmail sync scheduler started", {
    intervalMs,
    intervalHours: intervalMs / MS_PER_HOUR,
  });

  // Defer the first tick by 1 minute so the server is fully booted (DB,
  // registry, etc.) before reaching out to Gmail.
  setTimeout(() => {
    void tick();
  }, 60_000);
}

export function stopGmailSyncScheduler(): void {
  clearTimer();
  state.consecutiveFailures.clear();
  state.lastTickStartedAt = null;
  state.lastTickCompletedAt = null;
  state.inFlight = false;
}

export interface GmailSyncSchedulerStatus {
  enabled: boolean;
  intervalHours: number | null;
  lastTickStartedAt: number | null;
  lastTickCompletedAt: number | null;
  inFlight: boolean;
  consecutiveFailures: Record<string, number>;
}

export function getGmailSyncSchedulerStatus(): GmailSyncSchedulerStatus {
  return {
    enabled: state.timer !== null,
    intervalHours:
      state.intervalMs !== null ? state.intervalMs / MS_PER_HOUR : null,
    lastTickStartedAt: state.lastTickStartedAt,
    lastTickCompletedAt: state.lastTickCompletedAt,
    inFlight: state.inFlight,
    consecutiveFailures: Object.fromEntries(state.consecutiveFailures),
  };
}
