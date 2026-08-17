import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteJobsOlderThan: vi.fn(),
  discoverJobsStep: vi.fn(),
  importJobsStep: vi.fn(),
}));

vi.mock("@infra/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));
vi.mock("@server/pipeline/steps/discover-jobs", () => ({
  discoverJobsStep: mocks.discoverJobsStep,
}));
vi.mock("@server/pipeline/steps/import-jobs", () => ({
  importJobsStep: mocks.importJobsStep,
}));
vi.mock("@server/repositories/jobs", () => ({
  deleteJobsOlderThan: mocks.deleteJobsOlderThan,
}));
vi.mock("./demo-seed", () => ({
  applyDemoBaseline: vi.fn(),
  buildDemoBaseline: vi.fn(),
  DEMO_LIVE_JOB_SOURCES: ["linkedin", "indeed", "hiringcafe"],
}));

import { refreshDemoJobs } from "./demo-mode";

describe("demo job refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.discoverJobsStep.mockResolvedValue({
      discoveredJobs: [{ id: "one" }, { id: "two" }],
      sourceErrors: [],
      pendingChallenges: [],
    });
    mocks.importJobsStep.mockResolvedValue({
      created: 2,
      skipped: 0,
      fuzzyMerged: 0,
    });
    mocks.deleteJobsOlderThan.mockResolvedValue(3);
  });

  it("searches the three live US sources and applies 30-day retention", async () => {
    await expect(
      refreshDemoJobs(new Date("2026-08-17T00:00:00.000Z")),
    ).resolves.toEqual({
      jobsDiscovered: 2,
      jobsImported: 2,
      jobsDeleted: 3,
    });

    expect(mocks.discoverJobsStep).toHaveBeenCalledWith({
      mergedConfig: {
        sources: ["linkedin", "indeed", "hiringcafe"],
        locationIntent: expect.objectContaining({
          selectedCountry: "united states",
        }),
      },
      includeWatchlist: false,
    });
    expect(mocks.deleteJobsOlderThan).toHaveBeenCalledWith(
      new Date("2026-07-18T00:00:00.000Z"),
    );
  });
});
