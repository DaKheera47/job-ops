import * as jobsRepo from "@server/repositories/jobs";
import * as watchlistRepo from "@server/repositories/watchlist";
import { getWatchlistSourceAdapter } from "@server/watchlist/adapters";
import type { WatchlistSelectedSource } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getWatchlistResultsForSources,
  hydrateWatchlistSelectedSources,
} from "./results";

vi.mock("@server/repositories/watchlist", () => ({
  listWatchlistSelectedSources: vi.fn(),
  listWatchlistJobStates: vi.fn(),
  recordWatchlistCheck: vi.fn(),
}));

vi.mock("@server/repositories/jobs", () => ({
  getJobListItems: vi.fn(),
}));

vi.mock("@server/watchlist/adapters", () => ({
  getWatchlistSourceAdapter: vi.fn(),
  listWatchlistSourceAdapters: vi.fn(() => []),
}));

const workdaySource: WatchlistSelectedSource = {
  id: "workday-source",
  catalogSourceId: "acme",
  label: "Acme",
  careersUrl: "https://acme.wd1.myworkdayjobs.com/acme",
  cxsJobsUrl: null,
  sourceType: "workday",
  isCustom: false,
  sortOrder: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const bamboohrSource: WatchlistSelectedSource = {
  id: "bamboohr-source",
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

describe("watchlist results service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(watchlistRepo.recordWatchlistCheck).mockResolvedValue({
      previousLastCheckedAt: "2026-01-01T00:00:00.000Z",
      checkedAt: "2026-01-02T00:00:00.000Z",
      jobs: [
        {
          source: "workday:acme",
          sourceJobId: "new-job",
          isNewSinceLastCheck: true,
          firstSeenAt: "2026-01-02T00:00:00.000Z",
          lastSeenAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(watchlistRepo.listWatchlistJobStates).mockResolvedValue([
      {
        source: "workday:acme",
        sourceJobId: "ignored-job",
        state: "ignored",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    vi.mocked(jobsRepo.getJobListItems).mockResolvedValue([
      {
        id: "workspace-job",
        source: "bamboohr:beta",
        sourceJobId: "imported-job",
        title: "Imported",
        employer: "Beta",
        jobUrl: "https://beta.bamboohr.com/careers/2",
        applicationLink: "https://beta.bamboohr.com/careers/2",
        datePosted: null,
        deadline: null,
        salary: null,
        location: null,
        status: "discovered",
        outcome: null,
        closedAt: null,
        suitabilityScore: null,
        sponsorMatchScore: null,
        pdfRegenerating: false,
        pdfFreshness: "missing",
        salaryMinAmount: null,
        salaryMaxAmount: null,
        salaryCurrency: null,
        discoveredAt: "2026-01-01T00:00:00.000Z",
        readyAt: null,
        appliedAt: null,
        updatedAt: "2026-01-01T00:00:00.000Z",
      } as any,
    ]);
    vi.mocked(getWatchlistSourceAdapter).mockImplementation((sourceType) => {
      if (sourceType === "workday") {
        return {
          hydrateSelectedSource: (source: WatchlistSelectedSource) => ({
            ...source,
            label: "Hydrated Acme",
          }),
          fetchJobs: vi.fn().mockResolvedValue({
            total: 2,
            fetched: 2,
            jobs: [
              {
                jobRef: "https://example.com/new",
                source: "workday:acme",
                sourceJobId: "new-job",
                sourceType: "workday",
                title: "New Engineer",
                employer: "Acme",
                jobUrl: "https://example.com/new",
                applicationLink: "https://example.com/new",
                location: "London",
                postedAt: "2026-01-02",
              },
              {
                jobRef: "https://example.com/ignored",
                source: "workday:acme",
                sourceJobId: "ignored-job",
                sourceType: "workday",
                title: "Ignored Engineer",
                employer: "Acme",
                jobUrl: "https://example.com/ignored",
                applicationLink: "https://example.com/ignored",
                location: "London",
                postedAt: "2026-01-02",
              },
            ],
          }),
        } as any;
      }

      return {
        hydrateSelectedSource: (source: WatchlistSelectedSource) => source,
        fetchJobs: vi.fn().mockResolvedValue({
          total: 1,
          fetched: 1,
          jobs: [
            {
              jobRef: "https://beta.bamboohr.com/careers/2",
              source: "bamboohr:beta",
              sourceJobId: "imported-job",
              sourceType: "bamboohr",
              title: "Imported",
              employer: "Beta",
              jobUrl: "https://beta.bamboohr.com/careers/2",
              applicationLink: "https://beta.bamboohr.com/careers/2",
              location: "Remote",
              postedAt: null,
            },
          ],
        }),
      } as any;
    });
  });

  it("hydrates selected sources through their adapters", () => {
    expect(hydrateWatchlistSelectedSources([workdaySource])).toMatchObject([
      {
        id: "workday-source",
        label: "Hydrated Acme",
      },
    ]);
  });

  it("fetches sources, records checks, and annotates ignored/imported jobs", async () => {
    const result = await getWatchlistResultsForSources([
      workdaySource,
      bamboohrSource,
    ]);

    expect(watchlistRepo.recordWatchlistCheck).toHaveBeenCalledWith({
      checks: [
        { source: "workday:acme", sourceJobIds: ["new-job", "ignored-job"] },
        { source: "bamboohr:beta", sourceJobIds: ["imported-job"] },
      ],
    });
    expect(result.checkedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(result.sources).toHaveLength(2);

    const workdayJobs =
      result.sources[0]?.status === "success" ? result.sources[0].jobs : [];
    expect(workdayJobs.map((job) => job.rowState)).toEqual(["new", "ignored"]);
    expect(workdayJobs[0]?.isNewSinceLastCheck).toBe(true);

    const bamboohrJobs =
      result.sources[1]?.status === "success" ? result.sources[1].jobs : [];
    expect(bamboohrJobs[0]?.rowState).toBe("moved_to_workspace");
    expect(bamboohrJobs[0]?.workspaceJob).toEqual({
      id: "workspace-job",
      status: "discovered",
    });
  });
});
