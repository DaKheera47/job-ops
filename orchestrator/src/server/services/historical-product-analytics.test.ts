import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@infra/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

const trackCanonicalActivationEvent = vi.fn().mockResolvedValue(true);
const trackServerProductEvent = vi.fn().mockResolvedValue(true);
const claimAnalyticsServerEventReplay = vi.fn().mockResolvedValue(true);
const getAnalyticsRawEventReplayState = vi.fn().mockResolvedValue({
  id: "default",
  distinctId: "install-distinct-id",
  createdAt: "2026-01-01T00:00:00.000Z",
  rawEventReplayVersion: 0,
  rawEventReplayCompletedAt: null,
});
const getHistoricalServerEventReplayCandidates = vi.fn().mockResolvedValue([
  {
    eventKey: "application_marked_applied:stage-1",
    eventName: "application_marked_applied",
    occurredAt: 1_704_067_200_000,
    data: { source: "mark_applied" },
    urlPath: "/applications/in-progress",
  },
  {
    eventKey: "application_positive_response_detected:stage-2",
    eventName: "application_positive_response_detected",
    occurredAt: 1_704_153_600_000,
    data: { source: "manual" },
    urlPath: "/applications/in-progress",
  },
]);
const hasPendingAnalyticsServerEventReplays = vi.fn().mockResolvedValue(false);
const markAnalyticsRawEventReplayCompleted = vi
  .fn()
  .mockResolvedValue(undefined);
const markAnalyticsServerEventReplayDelivered = vi
  .fn()
  .mockResolvedValue(undefined);

vi.mock("@infra/product-analytics", () => ({
  trackServerProductEvent,
}));

vi.mock("@server/repositories/product-analytics", () => ({
  claimAnalyticsServerEventReplay,
  getAnalyticsRawEventReplayState,
  getHistoricalServerEventReplayCandidates,
  hasPendingAnalyticsServerEventReplays,
  markAnalyticsRawEventReplayCompleted,
  markAnalyticsServerEventReplayDelivered,
}));

vi.mock("@server/services/activation-funnel", () => ({
  trackCanonicalActivationEvent,
}));

describe("historical product analytics replay", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("skips mark_applied replay candidates to match live analytics", async () => {
    const { initializeHistoricalServerEventReplay } = await import(
      "./historical-product-analytics"
    );

    await initializeHistoricalServerEventReplay();

    expect(claimAnalyticsServerEventReplay).toHaveBeenCalledTimes(1);
    expect(claimAnalyticsServerEventReplay).toHaveBeenCalledWith(
      expect.objectContaining({
        eventKey: "application_positive_response_detected:stage-2",
      }),
    );
    expect(trackCanonicalActivationEvent).toHaveBeenCalledTimes(1);
    expect(trackCanonicalActivationEvent).toHaveBeenCalledWith(
      "application_positive_response_detected",
      { source: "manual" },
      expect.objectContaining({
        occurredAt: 1_704_153_600_000,
        urlPath: "/applications/in-progress",
      }),
    );
    expect(trackServerProductEvent).not.toHaveBeenCalled();
    expect(markAnalyticsServerEventReplayDelivered).toHaveBeenCalledTimes(1);
    expect(hasPendingAnalyticsServerEventReplays).toHaveBeenCalledWith([
      "application_positive_response_detected:stage-2",
    ]);
    expect(markAnalyticsRawEventReplayCompleted).toHaveBeenCalledWith({
      version: 1,
    });
  });
});
