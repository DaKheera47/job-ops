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

vi.mock("../../services/adzuna", () => ({
  runAdzuna: vi.fn(),
}));

vi.mock("../../services/hiring-cafe", () => ({
  runHiringCafe: vi.fn(),
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

  it("aggregates source errors for enabled sources", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobSpy = await import("../../services/jobspy");
    const ukVisa = await import("../../services/ukvisajobs");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
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
      expect.objectContaining({ sites: ["indeed", "linkedin"] }),
    );
  });

  it("passes glassdoor through to JobSpy when selected", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobSpy = await import("../../services/jobspy");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
    } as any);

    vi.mocked(jobSpy.runJobSpy).mockResolvedValue({
      success: true,
      jobs: [
        {
          source: "glassdoor",
          title: "Engineer",
          employer: "ACME",
          jobUrl: "https://example.com/job",
        },
      ],
    } as any);

    const result = await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["glassdoor"],
      },
    });

    expect(result.discoveredJobs).toHaveLength(1);
    expect(vi.mocked(jobSpy.runJobSpy)).toHaveBeenCalledWith(
      expect.objectContaining({ sites: ["glassdoor"] }),
    );
  });

  it("passes serialized multi-city locations to JobSpy", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobSpy = await import("../../services/jobspy");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united kingdom",
      searchCities: "London|Manchester",
    } as any);

    vi.mocked(jobSpy.runJobSpy).mockResolvedValue({
      success: true,
      jobs: [],
    } as any);

    await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["linkedin"],
      },
    });

    expect(vi.mocked(jobSpy.runJobSpy)).toHaveBeenCalledWith(
      expect.objectContaining({
        location: "London|Manchester",
      }),
    );
  });

  it("filters out glassdoor for unsupported countries", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobSpy = await import("../../services/jobspy");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "japan",
    } as any);

    vi.mocked(jobSpy.runJobSpy).mockResolvedValue({
      success: true,
      jobs: [],
    } as any);

    await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["glassdoor", "linkedin"],
      },
    });

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

  it("runs adzuna when selected and country is compatible", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const adzuna = await import("../../services/adzuna");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united states",
    } as any);

    vi.mocked(adzuna.runAdzuna).mockResolvedValue({
      success: true,
      jobs: [
        {
          source: "adzuna",
          sourceJobId: "adzu-1",
          title: "Engineer",
          employer: "ACME",
          jobUrl: "https://example.com/job",
          applicationLink: "https://example.com/job",
        },
      ],
    } as any);

    const result = await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["adzuna"],
      },
    });

    expect(result.discoveredJobs).toHaveLength(1);
    expect(vi.mocked(adzuna.runAdzuna)).toHaveBeenCalledWith(
      expect.objectContaining({ country: "us" }),
    );
  });

  it("passes configured city locations to adzuna", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const adzuna = await import("../../services/adzuna");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united kingdom",
      searchCities: "Leeds|Manchester",
    } as any);

    vi.mocked(adzuna.runAdzuna).mockResolvedValue({
      success: true,
      jobs: [],
    } as any);

    await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["adzuna"],
      },
    });

    expect(vi.mocked(adzuna.runAdzuna)).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "gb",
        countryKey: "united kingdom",
        locations: ["Leeds", "Manchester"],
      }),
    );
  });

  it("skips adzuna for unsupported countries", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const adzuna = await import("../../services/adzuna");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "japan",
    } as any);

    await expect(
      discoverJobsStep({
        mergedConfig: {
          ...config,
          sources: ["adzuna"],
        },
      }),
    ).rejects.toThrow("No compatible sources for selected country: Japan");

    expect(vi.mocked(adzuna.runAdzuna)).not.toHaveBeenCalled();
  });

  it("runs hiringcafe when selected and passes country/terms/cap", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const hiringCafe = await import("../../services/hiring-cafe");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united states",
      jobspyResultsWanted: "25",
    } as any);

    vi.mocked(hiringCafe.runHiringCafe).mockResolvedValue({
      success: true,
      jobs: [
        {
          source: "hiringcafe",
          sourceJobId: "hc-1",
          title: "Engineer",
          employer: "ACME",
          jobUrl: "https://example.com/hc",
          applicationLink: "https://example.com/hc",
        },
      ],
    } as any);

    const result = await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["hiringcafe"],
      },
    });

    expect(result.discoveredJobs).toHaveLength(1);
    expect(vi.mocked(hiringCafe.runHiringCafe)).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "united states",
        countryKey: "united states",
        locations: [],
        searchTerms: ["engineer"],
        maxJobsPerTerm: 25,
      }),
    );
  });

  it("passes configured city locations to hiringcafe", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const hiringCafe = await import("../../services/hiring-cafe");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united kingdom",
      jobspyResultsWanted: "25",
      searchCities: "Leeds|Manchester",
    } as any);

    vi.mocked(hiringCafe.runHiringCafe).mockResolvedValue({
      success: true,
      jobs: [],
    } as any);

    await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["hiringcafe"],
      },
    });

    expect(vi.mocked(hiringCafe.runHiringCafe)).toHaveBeenCalledWith(
      expect.objectContaining({
        country: "united kingdom",
        countryKey: "united kingdom",
        locations: ["Leeds", "Manchester"],
      }),
    );
  });

  it("updates Hiring Cafe terms and pages via progress callbacks", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const hiringCafe = await import("../../services/hiring-cafe");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer", "frontend"]),
      jobspyCountryIndeed: "united kingdom",
      jobspyResultsWanted: "50",
    } as any);

    vi.mocked(hiringCafe.runHiringCafe).mockImplementation(
      async (options: any) => {
        options?.onProgress?.({
          type: "term_start",
          termIndex: 1,
          termTotal: 2,
          searchTerm: "engineer",
        });
        options?.onProgress?.({
          type: "page_fetched",
          termIndex: 1,
          termTotal: 2,
          searchTerm: "engineer",
          pageNo: 0,
          resultsOnPage: 10,
          totalCollected: 10,
        });
        options?.onProgress?.({
          type: "term_complete",
          termIndex: 1,
          termTotal: 2,
          searchTerm: "engineer",
          jobsFoundTerm: 10,
        });
        return { success: true, jobs: [] } as any;
      },
    );

    await discoverJobsStep({
      mergedConfig: {
        ...config,
        sources: ["hiringcafe"],
      },
    });

    const progress = getProgress();
    expect(progress.crawlingTermsProcessed).toBe(1);
    expect(progress.crawlingTermsTotal).toBe(2);
    expect(progress.crawlingListPagesProcessed).toBe(1);
    expect(progress.crawlingJobPagesEnqueued).toBe(10);
    expect(progress.crawlingJobPagesProcessed).toBe(10);
  });

  it("returns Hiring Cafe source error when extractor fails", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const hiringCafe = await import("../../services/hiring-cafe");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united kingdom",
      jobspyResultsWanted: "50",
    } as any);

    vi.mocked(hiringCafe.runHiringCafe).mockResolvedValue({
      success: false,
      jobs: [],
      error: "blocked upstream",
    } as any);

    await expect(
      discoverJobsStep({
        mergedConfig: {
          ...config,
          sources: ["hiringcafe"],
        },
      }),
    ).rejects.toThrow("All sources failed: hiringcafe: blocked upstream");
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
    expect(progress.crawlingTermsProcessed).toBe(3);
    expect(progress.crawlingTermsTotal).toBe(4);
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
    const adzuna = await import("../../services/adzuna");
    const hiringCafe = await import("../../services/hiring-cafe");
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
    expect(vi.mocked(adzuna.runAdzuna)).not.toHaveBeenCalled();
    expect(vi.mocked(hiringCafe.runHiringCafe)).not.toHaveBeenCalled();
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
