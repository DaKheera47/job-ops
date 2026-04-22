import { logger } from "@infra/logger";
import { trackServerProductEvent } from "@infra/product-analytics";
import { sanitizeUnknown } from "@infra/sanitize";
import { getRequestContext } from "@server/infra/request-context";
import {
  ACTIVATION_MILESTONES,
  type ActivationMilestone,
  deleteActivationMilestone,
  getHistoricalActivationMilestoneCandidates,
  getOrCreateAnalyticsInstallState,
  listActivationMilestones,
  listPendingActivationMilestones,
  markActivationMilestoneReported,
  recordActivationMilestone,
  setActivationMilestoneFromHistory,
} from "@server/repositories/product-analytics";

const CANONICAL_EVENT_TO_MILESTONE = {
  jobs_pipeline_run_started: "activation_first_pipeline_run",
  application_marked_applied: "activation_first_application",
  application_positive_response_detected: "activation_first_positive_response",
  application_interview_stage_reached: "activation_first_interview",
  application_offer_detected: "activation_first_offer",
  application_accepted: "activation_first_acceptance",
} as const satisfies Record<string, ActivationMilestone>;

type CanonicalActivationEvent = keyof typeof CANONICAL_EVENT_TO_MILESTONE;

type TrackActivationEventOptions = {
  occurredAt?: Date | number | string | null;
  requestOrigin?: string | null;
  requestUserAgent?: string | null;
  sessionId?: string | null;
  urlPath?: string;
};

function toEpochMs(value: Date | number | string | null | undefined): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return Date.now();
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return Date.now();
}

function bucketElapsedHours(elapsedMs: number): string {
  const hours = Math.max(0, elapsedMs) / 3_600_000;
  if (hours < 1) return "lt_1h";
  if (hours < 6) return "1_6h";
  if (hours < 24) return "6_24h";
  if (hours < 72) return "24_72h";
  if (hours < 168) return "72_168h";
  return "168h_plus";
}

function bucketElapsedDays(elapsedMs: number): string {
  const days = Math.max(0, elapsedMs) / 86_400_000;
  if (days < 1) return "0d";
  if (days < 2) return "1d";
  if (days < 4) return "2_3d";
  if (days < 8) return "4_7d";
  if (days < 15) return "8_14d";
  if (days < 31) return "15_30d";
  return "31d_plus";
}

function buildMilestonePayload(args: {
  installCreatedAt: string;
  occurredAtMs: number;
  sessionId?: string | null;
}): Record<string, string | number> {
  const installCreatedAtMs = Date.parse(args.installCreatedAt);
  const elapsedMs =
    Number.isFinite(installCreatedAtMs) && installCreatedAtMs > 0
      ? Math.max(0, args.occurredAtMs - installCreatedAtMs)
      : 0;

  return {
    elapsedMs,
    elapsedHoursBucket: bucketElapsedHours(elapsedMs),
    elapsedDaysBucket: bucketElapsedDays(elapsedMs),
    ...(args.sessionId ? { sessionId: args.sessionId } : {}),
  };
}

async function emitActivationMilestone(args: {
  milestone: ActivationMilestone;
  occurredAtMs: number;
  installCreatedAt: string;
  requestOrigin?: string | null;
  requestUserAgent?: string | null;
  sessionId?: string | null;
  urlPath?: string;
}): Promise<boolean> {
  return trackServerProductEvent(
    args.milestone,
    buildMilestonePayload({
      installCreatedAt: args.installCreatedAt,
      occurredAtMs: args.occurredAtMs,
      sessionId: args.sessionId ?? null,
    }),
    {
      occurredAt: args.occurredAtMs,
      requestOrigin: args.requestOrigin,
      requestUserAgent: args.requestUserAgent,
      sessionId: args.sessionId ?? null,
      urlPath: args.urlPath ?? "/overview",
    },
  );
}

async function maybeReportMilestone(args: {
  milestone: ActivationMilestone;
  occurredAtMs: number;
  requestOrigin?: string | null;
  requestUserAgent?: string | null;
  sessionId?: string | null;
  urlPath?: string;
}): Promise<void> {
  const installState = await getOrCreateAnalyticsInstallState();
  const { milestone } = await recordActivationMilestone({
    milestone: args.milestone,
    firstSeenAt: args.occurredAtMs,
    sessionId: args.sessionId ?? null,
  });

  if (milestone.reportedAt) return;

  const delivered = await emitActivationMilestone({
    milestone: args.milestone,
    occurredAtMs: milestone.firstSeenAt,
    installCreatedAt: installState.installedAt,
    requestOrigin: args.requestOrigin,
    requestUserAgent: args.requestUserAgent,
    sessionId: milestone.firstSessionId ?? args.sessionId ?? null,
    urlPath: args.urlPath ?? "/overview",
  });

  if (delivered) {
    await markActivationMilestoneReported(args.milestone);
  }
}

export async function trackCanonicalActivationEvent(
  event: CanonicalActivationEvent,
  data?: Record<string, unknown>,
  options?: TrackActivationEventOptions,
): Promise<boolean> {
  try {
    if (process.env.NODE_ENV === "test") {
      return false;
    }

    const requestContext = getRequestContext();
    const sessionId =
      options?.sessionId ?? requestContext?.analyticsSessionId ?? null;
    const requestUserAgent =
      options?.requestUserAgent ?? requestContext?.requestUserAgent ?? null;
    const occurredAtMs = toEpochMs(options?.occurredAt);
    const delivered = await trackServerProductEvent(event, data, {
      occurredAt: occurredAtMs,
      requestOrigin: options?.requestOrigin,
      requestUserAgent,
      sessionId,
      urlPath: options?.urlPath,
    });

    await maybeReportMilestone({
      milestone: CANONICAL_EVENT_TO_MILESTONE[event],
      occurredAtMs,
      requestOrigin: options?.requestOrigin,
      requestUserAgent,
      sessionId,
      urlPath: options?.urlPath ?? "/overview",
    });

    return delivered;
  } catch (error) {
    logger.warn("Failed to track canonical activation event", {
      error: sanitizeUnknown(error),
      event,
      urlPath: options?.urlPath,
    });
    return false;
  }
}

export async function initializeActivationAnalytics(): Promise<void> {
  const installState = await getOrCreateAnalyticsInstallState();
  await reconcileActivationMilestonesFromHistorySafely({
    route: "startup",
  });

  const pendingMilestones = (await listPendingActivationMilestones()).sort(
    (left, right) => left.firstSeenAt - right.firstSeenAt,
  );

  for (const pending of pendingMilestones) {
    const delivered = await emitActivationMilestone({
      milestone: pending.milestone as ActivationMilestone,
      occurredAtMs: pending.firstSeenAt,
      installCreatedAt: installState.installedAt,
      requestOrigin: null,
      requestUserAgent: null,
      sessionId: pending.firstSessionId,
      urlPath: "/overview",
    });

    if (delivered) {
      await markActivationMilestoneReported(
        pending.milestone as ActivationMilestone,
      );
    }
  }
}

export async function reconcileActivationMilestonesFromHistory(): Promise<void> {
  const historicalCandidates =
    await getHistoricalActivationMilestoneCandidates();
  const existingMilestones = new Map(
    (await listActivationMilestones()).map((milestone) => [
      milestone.milestone as ActivationMilestone,
      milestone,
    ]),
  );

  for (const milestone of ACTIVATION_MILESTONES) {
    const occurredAtMs = historicalCandidates[milestone];
    const existing = existingMilestones.get(milestone) ?? null;

    if (typeof occurredAtMs === "number" && Number.isFinite(occurredAtMs)) {
      if (!existing) {
        await recordActivationMilestone({
          milestone,
          firstSeenAt: occurredAtMs,
          sessionId: null,
        });
        continue;
      }

      if (
        existing.firstSeenAt !== occurredAtMs ||
        existing.firstSessionId !== null
      ) {
        await setActivationMilestoneFromHistory({
          milestone,
          firstSeenAt: occurredAtMs,
        });
      }
      continue;
    }

    if (existing) {
      await deleteActivationMilestone(milestone);
    }
  }
}

export async function initializeActivationAnalyticsSafely(): Promise<void> {
  try {
    await initializeActivationAnalytics();
  } catch (error) {
    logger.warn("Failed to initialize activation analytics", { error });
  }
}

export async function reconcileActivationMilestonesFromHistorySafely(
  context?: Record<string, unknown>,
): Promise<void> {
  try {
    await reconcileActivationMilestonesFromHistory();
  } catch (error) {
    logger.warn("Failed to reconcile activation milestones from history", {
      ...context,
      error,
    });
  }
}
