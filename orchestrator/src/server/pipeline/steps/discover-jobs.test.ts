import type { PipelineConfig } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProgress, resetProgress } from "../progress";
import { discoverJobsStep } from "./discover-jobs";

vi.mock("../../repositories/jobs", () => ({
  getAllJobUrls: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../repositories/settings", () => ({
  getAllSettings: vi.fn(),
}));

vi.mock("../../services/jobspy", () => ({
  runJobSpy: vi.fn(),
}));

vi.mock("../../services/crawler", () => ({
  runCrawler: vi.fn(),
}));

vi.mock("../../services/ukvisajobs", () => ({
  runUkVisaJobs: vi.fn(),
}));

const config: PipelineConfig = {
  topN: 10,
  minSuitabilityScore: 50,
  sources: ["indeed", "linkedin", "ukvisajobs"],
  outputDir: "./tmp",
  enableCrawling: true,
  enableScoring: true,
  enableImporting: true,
  enableAutoTailoring: true,
};

describe("discoverJobsStep", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetProgress();
  });

  it("applies jobspySites setting and aggregates source errors", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobSpy = await import("../../services/jobspy");
    const ukVisa = await import("../../services/ukvisajobs");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspySites: JSON.stringify(["linkedin"]),
    } as any);

    vi.mocked(jobSpy.runJobSpy).mockResolvedValue({
      success: true,
      jobs: [
        {
          source: "linkedin",
          title: "Engineer",
          employer: "ACME",
          jobUrl: "https://example.com/job",
        },
      ],
    } as any);

    vi.mocked(ukVisa.runUkVisaJobs).mockResolvedValue({
      success: false,
      error: "login failed",
    } as any);

    const result = await discoverJobsStep({ mergedConfig: config });

    expect(result.discoveredJobs).toHaveLength(1);
    expect(result.sourceErrors).toEqual(["ukvisajobs: login failed"]);
    expect(vi.mocked(jobSpy.runJobSpy)).toHaveBeenCalledWith(
      expect.objectContaining({ sites: ["linkedin"] }),
    );
  });

  it("throws when all enabled sources fail", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const ukVisa = await import("../../services/ukvisajobs");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
    } as any);

    vi.mocked(ukVisa.runUkVisaJobs).mockResolvedValue({
      success: false,
      error: "boom",
    } as any);

    await expect(
      discoverJobsStep({
        mergedConfig: {
          ...config,
          sources: ["ukvisajobs"],
        },
      }),
    ).rejects.toThrow("All sources failed: ukvisajobs: boom");
  });

  it("maps Gradcracker progress callback into live crawling counters", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const crawler = await import("../../services/crawler");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
    } as any);

    vi.mocked(crawler.runCrawler).mockImplementation(async (options: any) => {
      options?.onProgress?.({
        phase: "list",
        currentUrl: "https://example.com/list",
        listPagesProcessed: 3,
        listPagesTotal: 10,
        jobCardsFound: 42,
        jobPagesEnqueued: 30,
        jobPagesSkipped: 4,
        jobPagesProcessed: 8,
      });
      return { success: true, jobs: [] } as any;
    });

    await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["gradcracker"],
      },
    });

    const progress = getProgress();
    expect(progress.crawlingSource).toBeNull();
    expect(progress.crawlingListPagesProcessed).toBe(3);
    expect(progress.crawlingListPagesTotal).toBe(10);
    expect(progress.crawlingJobCardsFound).toBe(42);
    expect(progress.crawlingJobPagesEnqueued).toBe(30);
    expect(progress.crawlingJobPagesSkipped).toBe(4);
    expect(progress.crawlingJobPagesProcessed).toBe(8);
  });

  it("updates JobSpy terms and UKVisa pages via progress callbacks", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobSpy = await import("../../services/jobspy");
    const ukVisa = await import("../../services/ukvisajobs");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer", "frontend"]),
      jobspySites: JSON.stringify(["linkedin"]),
    } as any);

    vi.mocked(jobSpy.runJobSpy).mockImplementation(async (options: any) => {
      options?.onProgress?.({
        type: "term_start",
        termIndex: 1,
        termTotal: 2,
        searchTerm: "engineer",
      });
      options?.onProgress?.({
        type: "term_complete",
        termIndex: 1,
        termTotal: 2,
        searchTerm: "engineer",
        jobsFoundTerm: 10,
      });
      options?.onProgress?.({
        type: "term_start",
        termIndex: 2,
        termTotal: 2,
        searchTerm: "frontend",
      });
      options?.onProgress?.({
        type: "term_complete",
        termIndex: 2,
        termTotal: 2,
        searchTerm: "frontend",
        jobsFoundTerm: 8,
      });
      return { success: true, jobs: [] } as any;
    });

    vi.mocked(ukVisa.runUkVisaJobs).mockImplementation(async (options: any) => {
      options?.onProgress?.({
        type: "init",
        termIndex: 1,
        termTotal: 2,
        searchTerm: "engineer",
        maxPages: 4,
        maxJobs: 50,
      });
      options?.onProgress?.({
        type: "page_fetched",
        termIndex: 1,
        termTotal: 2,
        searchTerm: "engineer",
        pageNo: 2,
        maxPages: 4,
        jobsOnPage: 15,
        totalCollected: 18,
        totalAvailable: 100,
      });
      options?.onProgress?.({
        type: "term_complete",
        termIndex: 1,
        termTotal: 2,
        searchTerm: "engineer",
        jobsFoundTerm: 18,
        totalCollected: 18,
      });
      return { success: true, jobs: [] } as any;
    });

    await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["linkedin", "ukvisajobs"],
      },
    });

    const progress = getProgress();
    expect(progress.crawlingTermsProcessed).toBe(1);
    expect(progress.crawlingTermsTotal).toBe(2);
    expect(progress.crawlingListPagesProcessed).toBe(2);
    expect(progress.crawlingListPagesTotal).toBe(4);
    expect(progress.crawlingJobPagesEnqueued).toBe(18);
    expect(progress.crawlingJobPagesProcessed).toBe(18);
  });

  it("skips UK-only sources for non-UK country and runs compatible sources", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobSpy = await import("../../services/jobspy");
    const crawler = await import("../../services/crawler");
    const ukVisa = await import("../../services/ukvisajobs");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united states",
    } as any);

    vi.mocked(jobSpy.runJobSpy).mockResolvedValue({
      success: true,
      jobs: [
        {
          source: "linkedin",
          title: "Engineer",
          employer: "ACME",
          jobUrl: "https://example.com/job",
        },
      ],
    } as any);

    const result = await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["linkedin", "gradcracker", "ukvisajobs"],
      },
    });

    expect(result.discoveredJobs).toHaveLength(1);
    expect(vi.mocked(jobSpy.runJobSpy)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(crawler.runCrawler)).not.toHaveBeenCalled();
    expect(vi.mocked(ukVisa.runUkVisaJobs)).not.toHaveBeenCalled();
  });

  it("throws when all requested sources are incompatible for country", async () => {
    const settingsRepo = await import("../../repositories/settings");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united states",
    } as any);

    await expect(
      discoverJobsStep({
        mergedConfig: {
          ...config,
          sources: ["gradcracker", "ukvisajobs"],
        },
      }),
    ).rejects.toThrow(
      "No compatible sources for selected country: United States",
    );
  });

  it("does not throw when no sources are requested", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobSpy = await import("../../services/jobspy");
    const crawler = await import("../../services/crawler");
    const ukVisa = await import("../../services/ukvisajobs");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united states",
    } as any);

    const result = await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: [],
      },
    });

    expect(result.discoveredJobs).toEqual([]);
    expect(result.sourceErrors).toEqual([]);
    expect(vi.mocked(jobSpy.runJobSpy)).not.toHaveBeenCalled();
    expect(vi.mocked(crawler.runCrawler)).not.toHaveBeenCalled();
    expect(vi.mocked(ukVisa.runUkVisaJobs)).not.toHaveBeenCalled();
  });

  it("tracks source completion counters across source transitions", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobSpy = await import("../../services/jobspy");
    const crawler = await import("../../services/crawler");
    const ukVisa = await import("../../services/ukvisajobs");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
    } as any);

    vi.mocked(jobSpy.runJobSpy).mockResolvedValue({
      success: true,
      jobs: [],
    } as any);
    vi.mocked(crawler.runCrawler).mockResolvedValue({
      success: true,
      jobs: [],
    } as any);
    vi.mocked(ukVisa.runUkVisaJobs).mockResolvedValue({
      success: true,
      jobs: [],
    } as any);

    await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["linkedin", "gradcracker", "ukvisajobs"],
      },
    });

    const progress = getProgress();
    expect(progress.crawlingSourcesTotal).toBe(3);
    expect(progress.crawlingSourcesCompleted).toBe(3);
  });
});
