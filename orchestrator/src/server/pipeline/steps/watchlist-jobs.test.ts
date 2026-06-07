import { runWithRequestContext } from "@infra/request-context";
import {
  getWatchlistResultsForSources,
  listHydratedWatchlistSelectedSources,
  withWatchlistSourceTimeout,
} from "@server/watchlist/results";
import type {
  WatchlistJobResult,
  WatchlistSelectedSource,
} from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { discoverWatchlistJobsForPipeline } from "./watchlist-jobs";

vi.mock("@server/watchlist/results", () => ({
  getWatchlistResultsForSources: vi.fn(),
  listHydratedWatchlistSelectedSources: vi.fn(),
  withWatchlistSourceTimeout: vi.fn((callback) =>
    callback(new AbortController().signal),
  ),
}));

vi.mock("@server/watchlist/adapters", () => ({
  getWatchlistSourceAdapter: vi.fn(),
}));

const workdaySource: WatchlistSelectedSource = {
  id: "source-workday",
  catalogSourceId: "acme",
  label: "Acme",
  careersUrl: "https://acme.wd1.myworkdayjobs.com/acme",
  cxsJobsUrl: "https://acme.wd1.myworkdayjobs.com/wday/cxs/acme/acme/jobs",
  sourceType: "workday",
  isCustom: false,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const bamboohrSource: WatchlistSelectedSource = {
  id: "source-bamboohr",
  catalogSourceId: null,
  label: "Beta",
  careersUrl: "https://beta.bamboohr.com/careers",
  cxsJobsUrl: null,
  sourceType: "bamboohr",
  isCustom: true,
  sortOrder: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function watchlistJob(overrides: Partial<WatchlistJobResult>) {
  return {
    jobRef: "https://example.com/job",
    source: "workday:acme",
    sourceJobId: "job-1",
    sourceType: "workday",
    title: "Platform Engineer",
    employer: "Acme",
    jobUrl: "https://example.com/job",
    applicationLink: "https://example.com/job",
    location: "London, United Kingdom",
    postedAt: "2026-01-02",
    rowState: "new",
    isNewSinceLastCheck: true,
    workspaceJob: null,
    ...overrides,
  } satisfies WatchlistJobResult;
}

describe("discoverWatchlistJobsForPipeline", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(listHydratedWatchlistSelectedSources).mockResolvedValue([]);
    vi.mocked(getWatchlistResultsForSources).mockResolvedValue({
      checkedAt: "2026-01-03T00:00:00.000Z",
      previousLastCheckedAt: null,
      sources: [],
    });

    const adapters = await import("@server/watchlist/adapters");
    vi.mocked(adapters.getWatchlistSourceAdapter).mockReturnValue({
      sourceType: "workday",
      descriptor: {} as any,
      catalogSchema: {} as any,
      parseCatalogSources: vi.fn(),
      hydrateSelectedSource: vi.fn(),
      normalizeCustomSelection: vi.fn(),
      fetchJobs: vi.fn(),
      fetchJobDetails: vi.fn(),
      prepareImportDraft: vi.fn().mockResolvedValue({
        draft: {
          source: "workday:acme",
          sourceJobId: "job-1",
          title: "Platform Engineer",
          employer: "Acme",
          jobUrl: "https://example.com/job",
          applicationLink: "https://example.com/apply",
          location: "London, United Kingdom",
          jobDescription: "Build reliable systems.",
          jobType: "Full time",
        },
        source: "workday:acme",
        sourceHost: "example.com",
      }),
    } as any);
  });

  it("fetches details and converts Workday and BambooHR watchlist jobs", async () => {
    vi.mocked(getWatchlistResultsForSources).mockResolvedValue({
      checkedAt: "2026-01-03T00:00:00.000Z",
      previousLastCheckedAt: null,
      sources: [
        {
          status: "success",
          source: workdaySource,
          jobs: [watchlistJob({})],
          total: 1,
          fetched: 1,
        },
        {
          status: "success",
          source: bamboohrSource,
          jobs: [
            watchlistJob({
              jobRef: "https://beta.bamboohr.com/careers/2",
              source: "bamboohr:beta",
              sourceJobId: "job-2",
              sourceType: "bamboohr",
              title: "Backend Engineer",
              employer: "Beta",
              jobUrl: "https://beta.bamboohr.com/careers/2",
              applicationLink: "https://beta.bamboohr.com/careers/2",
            }),
          ],
          total: 1,
          fetched: 1,
        },
      ],
    });

    const result = await runWithRequestContext(
      { requestId: "test", tenantId: "tenant-a", userId: "user-a" },
      () =>
        discoverWatchlistJobsForPipeline({
          selectedSources: [workdaySource, bamboohrSource],
        }),
    );

    expect(result.discoveredJobs).toHaveLength(2);
    expect(result.discoveredJobs[0]).toMatchObject({
      source: "workday:acme",
      sourceJobId: "job-1",
      title: "Platform Engineer",
      employer: "Acme",
      jobUrl: "https://example.com/job",
      applicationLink: "https://example.com/apply",
      jobDescription: "Build reliable systems.",
      datePosted: "2026-01-02",
    });
    expect(withWatchlistSourceTimeout).toHaveBeenCalledTimes(2);
  });

  it("skips ignored and already-imported watchlist jobs", async () => {
    vi.mocked(getWatchlistResultsForSources).mockResolvedValue({
      checkedAt: "2026-01-03T00:00:00.000Z",
      previousLastCheckedAt: null,
      sources: [
        {
          status: "success",
          source: workdaySource,
          jobs: [
            watchlistJob({ rowState: "ignored" }),
            watchlistJob({
              rowState: "moved_to_workspace",
              sourceJobId: "job-2",
              workspaceJob: { id: "workspace-job", status: "discovered" },
            }),
          ],
          total: 2,
          fetched: 2,
        },
      ],
    });

    const result = await runWithRequestContext(
      { requestId: "test", tenantId: "tenant-a", userId: "user-a" },
      () =>
        discoverWatchlistJobsForPipeline({
          selectedSources: [workdaySource],
        }),
    );

    expect(result.discoveredJobs).toEqual([]);
    expect(withWatchlistSourceTimeout).not.toHaveBeenCalled();
  });

  it("reports detail failures without returning raw upstream bodies", async () => {
    const adapters = await import("@server/watchlist/adapters");
    vi.mocked(adapters.getWatchlistSourceAdapter).mockReturnValue({
      prepareImportDraft: vi
        .fn()
        .mockRejectedValue(new Error("raw upstream body with secret token")),
    } as any);
    vi.mocked(getWatchlistResultsForSources).mockResolvedValue({
      checkedAt: "2026-01-03T00:00:00.000Z",
      previousLastCheckedAt: null,
      sources: [
        {
          status: "success",
          source: workdaySource,
          jobs: [watchlistJob({})],
          total: 1,
          fetched: 1,
        },
      ],
    });

    const result = await runWithRequestContext(
      { requestId: "test", tenantId: "tenant-a", userId: "user-a" },
      () =>
        discoverWatchlistJobsForPipeline({
          selectedSources: [workdaySource],
        }),
    );

    expect(result.discoveredJobs).toEqual([]);
    expect(result.sourceErrors).toEqual([
      "Watchlist Acme: failed to fetch details for job-1",
    ]);
    expect(result.sourceErrors.join(" ")).not.toContain("secret token");
  });

  it("does nothing when no user context is active", async () => {
    const result = await discoverWatchlistJobsForPipeline();

    expect(result).toEqual({
      discoveredJobs: [],
      sourceErrors: [],
      selectedSourceCount: 0,
      failedSourceCount: 0,
    });
    expect(listHydratedWatchlistSelectedSources).not.toHaveBeenCalled();
  });
});
