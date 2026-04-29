import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./client";

function createJsonResponse(status: number, payload: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as Response;
}

describe("pipeline client helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    api.__resetApiClientAuthForTests();
  });

  afterEach(() => {
    api.__resetApiClientAuthForTests();
  });

  it("fetches recent pipeline runs", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(200, {
        ok: true,
        data: [
          {
            id: "run-1",
            startedAt: "2026-04-18T10:00:00.000Z",
            completedAt: "2026-04-18T10:05:00.000Z",
            status: "completed",
            jobsDiscovered: 10,
            jobsProcessed: 2,
            errorMessage: null,
          },
        ],
        meta: { requestId: "req-runs" },
      }),
    );

    await expect(api.getPipelineRuns()).resolves.toEqual([
      expect.objectContaining({ id: "run-1", status: "completed" }),
    ]);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/pipeline/runs",
      expect.any(Object),
    );
  });

  it("fetches the current pipeline progress snapshot", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(200, {
        ok: true,
        data: {
          step: "crawling",
          message: "Fetching jobs from sources...",
          crawlingSource: "linkedin",
          crawlingSourcesCompleted: 0,
          crawlingSourcesTotal: 2,
          crawlingTermsProcessed: 1,
          crawlingTermsTotal: 4,
          crawlingListPagesProcessed: 3,
          crawlingListPagesTotal: 10,
          crawlingJobCardsFound: 12,
          crawlingJobPagesEnqueued: 5,
          crawlingJobPagesSkipped: 1,
          crawlingJobPagesProcessed: 2,
          jobsDiscovered: 8,
          jobsScored: 0,
          jobsProcessed: 0,
          totalToProcess: 0,
        },
        meta: { requestId: "req-progress" },
      }),
    );

    await expect(api.getPipelineProgressSnapshot()).resolves.toEqual(
      expect.objectContaining({
        step: "crawling",
        message: "Fetching jobs from sources...",
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/pipeline/progress/snapshot",
      expect.any(Object),
    );
  });

  it("fetches pipeline run insights for a specific run", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      createJsonResponse(200, {
        ok: true,
        data: {
          run: {
            id: "run insight/1",
            startedAt: "2026-04-18T10:00:00.000Z",
            completedAt: "2026-04-18T10:05:00.000Z",
            status: "completed",
            jobsDiscovered: 10,
            jobsProcessed: 2,
            errorMessage: null,
          },
          exactMetrics: { durationMs: 300000 },
          savedDetails: null,
          inferredMetrics: {
            jobsCreated: { value: 5, quality: "inferred_from_timestamps" },
            jobsUpdated: { value: 4, quality: "inferred_from_timestamps" },
            jobsProcessed: { value: 2, quality: "inferred_from_timestamps" },
          },
        },
        meta: { requestId: "req-insights" },
      }),
    );

    await expect(api.getPipelineRunInsights("run insight/1")).resolves.toEqual(
      expect.objectContaining({
        exactMetrics: { durationMs: 300000 },
      }),
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/pipeline/runs/run%20insight%2F1/insights",
      expect.any(Object),
    );
  });
});
