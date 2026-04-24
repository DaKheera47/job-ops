import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@infra/logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock("@infra/product-analytics", () => ({
  trackServerProductEvent: vi.fn().mockRejectedValue(new Error("boom")),
}));

vi.mock("@server/infra/request-context", () => ({
  getRequestContext: vi.fn(() => null),
}));

vi.mock("@server/repositories/product-analytics", () => ({
  getHistoricalActivationMilestoneCandidates: vi
    .fn()
    .mockRejectedValue(new Error("history boom")),
}));

describe("activation funnel safety wrappers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.env.NODE_ENV = "test";
  });

  it("swallows canonical event tracking failures", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const { logger } = await import("@infra/logger");
    const { trackCanonicalActivationEvent } = await import(
      "./activation-funnel"
    );

    await expect(
      trackCanonicalActivationEvent("jobs_pipeline_run_started", {
        source: "test",
      }),
    ).resolves.toBe(false);

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to track canonical activation event",
      expect.objectContaining({
        event: "jobs_pipeline_run_started",
      }),
    );

    process.env.NODE_ENV = previousNodeEnv;
  });

  it("swallows history reconciliation failures", async () => {
    const { logger } = await import("@infra/logger");
    const { reconcileActivationMilestonesFromHistorySafely } = await import(
      "./activation-funnel"
    );

    await expect(
      reconcileActivationMilestonesFromHistorySafely({
        route: "PATCH /api/jobs/:id",
        jobId: "job-123",
      }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      "Failed to reconcile activation milestones from history",
      expect.objectContaining({
        route: "PATCH /api/jobs/:id",
        jobId: "job-123",
      }),
    );
  });
});
