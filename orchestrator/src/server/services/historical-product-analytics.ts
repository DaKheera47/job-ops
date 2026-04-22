import { logger } from "@infra/logger";
import { trackServerProductEvent } from "@infra/product-analytics";
import { sanitizeUnknown } from "@infra/sanitize";
import {
  claimAnalyticsServerEventReplay,
  getAnalyticsRawEventReplayState,
  getHistoricalServerEventReplayCandidates,
  hasPendingAnalyticsServerEventReplays,
  markAnalyticsRawEventReplayCompleted,
  markAnalyticsServerEventReplayDelivered,
} from "@server/repositories/product-analytics";
import { trackCanonicalActivationEvent } from "@server/services/activation-funnel";

const RAW_EVENT_REPLAY_VERSION = 1;

type CanonicalActivationEvent =
  | "application_marked_applied"
  | "application_positive_response_detected"
  | "application_interview_stage_reached"
  | "application_offer_detected"
  | "application_accepted";

const CANONICAL_ACTIVATION_EVENTS = new Set<CanonicalActivationEvent>([
  "application_marked_applied",
  "application_positive_response_detected",
  "application_interview_stage_reached",
  "application_offer_detected",
  "application_accepted",
]);

function isCanonicalActivationEvent(
  eventName: string,
): eventName is CanonicalActivationEvent {
  return CANONICAL_ACTIVATION_EVENTS.has(eventName as CanonicalActivationEvent);
}

export async function initializeHistoricalServerEventReplay(): Promise<void> {
  const installState = await getAnalyticsRawEventReplayState();
  if (installState.rawEventReplayVersion >= RAW_EVENT_REPLAY_VERSION) {
    return;
  }

  const cutoffMs = Date.parse(installState.createdAt);
  const replayCutoffMs = Number.isFinite(cutoffMs) ? cutoffMs : Date.now();
  const candidates = await getHistoricalServerEventReplayCandidates({
    cutoffMs: replayCutoffMs,
  });
  let allDelivered = true;

  for (const candidate of candidates) {
    const claimed = await claimAnalyticsServerEventReplay({
      eventKey: candidate.eventKey,
      eventName: candidate.eventName,
      occurredAt: candidate.occurredAt,
      payload: candidate.data,
    });

    if (!claimed) {
      continue;
    }

    const delivered = isCanonicalActivationEvent(candidate.eventName)
      ? await trackCanonicalActivationEvent(
          candidate.eventName,
          candidate.data,
          {
            occurredAt: candidate.occurredAt,
            urlPath: candidate.urlPath,
          },
        )
      : await trackServerProductEvent(candidate.eventName, candidate.data, {
          distinctId: installState.distinctId,
          occurredAt: candidate.occurredAt,
          urlPath: candidate.urlPath,
        });

    if (delivered) {
      await markAnalyticsServerEventReplayDelivered(candidate.eventKey);
    } else {
      allDelivered = false;
      logger.warn("Historical product analytics replay send failed", {
        event: candidate.eventName,
        eventKey: candidate.eventKey,
      });
    }
  }

  const hasPendingRows = await hasPendingAnalyticsServerEventReplays(
    candidates.map((candidate) => candidate.eventKey),
  );

  if (allDelivered && !hasPendingRows) {
    await markAnalyticsRawEventReplayCompleted({
      version: RAW_EVENT_REPLAY_VERSION,
    });
  }
}

export async function initializeHistoricalServerEventReplaySafely(): Promise<void> {
  try {
    await initializeHistoricalServerEventReplay();
  } catch (error) {
    logger.warn("Failed to initialize historical server event replay", {
      error: sanitizeUnknown(error),
    });
  }
}
