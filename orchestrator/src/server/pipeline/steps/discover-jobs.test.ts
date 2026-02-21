import type { PipelineConfig } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProgress, resetProgress } from "../progress";
import { discoverJobsStep } from "./discover-jobs";

vi.mock("../../repositories/settings", () => ({
  getAllSettings: vi.fn(),
}));

vi.mock("../../repositories/jobs", () => ({
  getAllJobUrls: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../extractors/registry", () => ({
  getExtractorRegistry: vi.fn(),
}));

const baseConfig: PipelineConfig = {
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
    const registryModule = await import("../../extractors/registry");

    const jobspyManifest = {
      id: "jobspy",
      displayName: "JobSpy",
      providesSources: ["indeed", "linkedin", "glassdoor"],
      run: vi.fn().mockResolvedValue({
        success: true,
        jobs: [
          {
            source: "linkedin",
            title: "Engineer",
            employer: "ACME",
            jobUrl: "https://example.com/job",
          },
        ],
      }),
    };
    const ukvisaManifest = {
      id: "ukvisajobs",
      displayName: "UK Visa Jobs",
      providesSources: ["ukvisajobs"],
      run: vi.fn().mockResolvedValue({
        success: false,
        jobs: [],
        error: "login failed",
      }),
    };

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
    } as any);

    vi.mocked(registryModule.getExtractorRegistry).mockResolvedValue({
      manifests: new Map([
        ["jobspy", jobspyManifest as any],
        ["ukvisajobs", ukvisaManifest as any],
      ]),
      manifestBySource: new Map([
        ["indeed", jobspyManifest as any],
        ["linkedin", jobspyManifest as any],
        ["glassdoor", jobspyManifest as any],
        ["ukvisajobs", ukvisaManifest as any],
      ]),
      availableSources: ["indeed", "linkedin", "glassdoor", "ukvisajobs"],
    } as any);

    const result = await discoverJobsStep({ mergedConfig: baseConfig });

    expect(result.discoveredJobs).toHaveLength(1);
    expect(result.sourceErrors).toEqual([
      "UK Visa Jobs: login failed (sources: ukvisajobs)",
    ]);
    expect(jobspyManifest.run).toHaveBeenCalledWith(
      expect.objectContaining({ selectedSources: ["indeed", "linkedin"] }),
    );
  });

  it("throws when all enabled sources fail", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const registryModule = await import("../../extractors/registry");

    const ukvisaManifest = {
      id: "ukvisajobs",
      displayName: "UK Visa Jobs",
      providesSources: ["ukvisajobs"],
      run: vi.fn().mockResolvedValue({
        success: false,
        jobs: [],
        error: "boom",
      }),
    };

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
    } as any);

    vi.mocked(registryModule.getExtractorRegistry).mockResolvedValue({
      manifests: new Map([["ukvisajobs", ukvisaManifest as any]]),
      manifestBySource: new Map([["ukvisajobs", ukvisaManifest as any]]),
      availableSources: ["ukvisajobs"],
    } as any);

    await expect(
      discoverJobsStep({
        mergedConfig: {
          ...baseConfig,
          sources: ["ukvisajobs"],
        },
      }),
    ).rejects.toThrow(
      "All sources failed: UK Visa Jobs: boom (sources: ukvisajobs)",
    );
  });

  it("throws when all requested sources are incompatible for country", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const registryModule = await import("../../extractors/registry");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united states",
    } as any);

    vi.mocked(registryModule.getExtractorRegistry).mockResolvedValue({
      manifests: new Map(),
      manifestBySource: new Map(),
      availableSources: [],
    } as any);

    await expect(
      discoverJobsStep({
        mergedConfig: {
          ...baseConfig,
          sources: ["gradcracker", "ukvisajobs"],
        },
      }),
    ).rejects.toThrow(
      "No compatible sources for selected country: United States",
    );
  });

  it("does not throw when no sources are requested", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const registryModule = await import("../../extractors/registry");

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      jobspyCountryIndeed: "united states",
    } as any);

    vi.mocked(registryModule.getExtractorRegistry).mockResolvedValue({
      manifests: new Map(),
      manifestBySource: new Map(),
      availableSources: [],
    } as any);

    const result = await discoverJobsStep({
      mergedConfig: {
        ...baseConfig,
        sources: [],
      },
    });

    expect(result.discoveredJobs).toEqual([]);
    expect(result.sourceErrors).toEqual([]);
  });

  it("drops discovered jobs when employer matches blocked company keywords", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const registryModule = await import("../../extractors/registry");

    const jobspyManifest = {
      id: "jobspy",
      displayName: "JobSpy",
      providesSources: ["indeed", "linkedin", "glassdoor"],
      run: vi.fn().mockResolvedValue({
        success: true,
        jobs: [
          {
            source: "linkedin",
            title: "Engineer",
            employer: "Acme Staffing",
            jobUrl: "https://example.com/job-1",
          },
          {
            source: "linkedin",
            title: "Engineer II",
            employer: "Contoso",
            jobUrl: "https://example.com/job-2",
          },
        ],
      }),
    };

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      blockedCompanyKeywords: JSON.stringify(["recruit", "staffing"]),
    } as any);

    vi.mocked(registryModule.getExtractorRegistry).mockResolvedValue({
      manifests: new Map([["jobspy", jobspyManifest as any]]),
      manifestBySource: new Map([
        ["indeed", jobspyManifest as any],
        ["linkedin", jobspyManifest as any],
        ["glassdoor", jobspyManifest as any],
      ]),
      availableSources: ["indeed", "linkedin", "glassdoor"],
    } as any);

    const result = await discoverJobsStep({
      mergedConfig: {
        ...baseConfig,
        sources: ["linkedin"],
      },
    });

    expect(result.discoveredJobs).toHaveLength(1);
    expect(result.discoveredJobs[0]?.employer).toBe("Contoso");
  });

  it("applies shared city filtering for sources without native city filtering", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const registryModule = await import("../../extractors/registry");

    const gradcrackerManifest = {
      id: "gradcracker",
      displayName: "Gradcracker",
      providesSources: ["gradcracker"],
      run: vi.fn().mockResolvedValue({
        success: true,
        jobs: [
          {
            source: "gradcracker",
            title: "Engineer - Leeds",
            employer: "ACME",
            location: "Leeds, England, UK",
            jobUrl: "https://example.com/grad-1",
          },
          {
            source: "gradcracker",
            title: "Engineer - London",
            employer: "ACME",
            location: "London, England, UK",
            jobUrl: "https://example.com/grad-2",
          },
        ],
      }),
    };
    const ukvisaManifest = {
      id: "ukvisajobs",
      displayName: "UK Visa Jobs",
      providesSources: ["ukvisajobs"],
      run: vi.fn().mockResolvedValue({
        success: true,
        jobs: [
          {
            source: "ukvisajobs",
            title: "Developer - Leeds",
            employer: "Contoso",
            location: "Leeds, England, UK",
            jobUrl: "https://example.com/ukv-1",
          },
        ],
      }),
    };

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
      searchCities: "Leeds",
      jobspyCountryIndeed: "united kingdom",
    } as any);

    vi.mocked(registryModule.getExtractorRegistry).mockResolvedValue({
      manifests: new Map([
        ["gradcracker", gradcrackerManifest as any],
        ["ukvisajobs", ukvisaManifest as any],
      ]),
      manifestBySource: new Map([
        ["gradcracker", gradcrackerManifest as any],
        ["ukvisajobs", ukvisaManifest as any],
      ]),
      availableSources: ["gradcracker", "ukvisajobs"],
    } as any);

    const result = await discoverJobsStep({
      mergedConfig: {
        ...baseConfig,
        sources: ["gradcracker", "ukvisajobs"],
      },
    });

    expect(result.discoveredJobs).toHaveLength(2);
    expect(
      result.discoveredJobs.every((job) => job.location?.includes("Leeds")),
    ).toBe(true);
  });

  it("tracks source completion counters across source transitions", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobsRepo = await import("../../repositories/jobs");
    const registryModule = await import("../../extractors/registry");

    const jobspyManifest = {
      id: "jobspy",
      displayName: "JobSpy",
      providesSources: ["indeed", "linkedin", "glassdoor"],
      run: vi.fn().mockResolvedValue({ success: true, jobs: [] }),
    };
    const gradcrackerManifest = {
      id: "gradcracker",
      displayName: "Gradcracker",
      providesSources: ["gradcracker"],
      run: vi.fn().mockResolvedValue({ success: true, jobs: [] }),
    };
    const ukvisaManifest = {
      id: "ukvisajobs",
      displayName: "UK Visa Jobs",
      providesSources: ["ukvisajobs"],
      run: vi.fn().mockResolvedValue({ success: true, jobs: [] }),
    };

    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      searchTerms: JSON.stringify(["engineer"]),
    } as any);
    vi.mocked(jobsRepo.getAllJobUrls).mockResolvedValue([
      "https://example.com/existing",
    ]);

    vi.mocked(registryModule.getExtractorRegistry).mockResolvedValue({
      manifests: new Map([
        ["jobspy", jobspyManifest as any],
        ["gradcracker", gradcrackerManifest as any],
        ["ukvisajobs", ukvisaManifest as any],
      ]),
      manifestBySource: new Map([
        ["indeed", jobspyManifest as any],
        ["linkedin", jobspyManifest as any],
        ["glassdoor", jobspyManifest as any],
        ["gradcracker", gradcrackerManifest as any],
        ["ukvisajobs", ukvisaManifest as any],
      ]),
      availableSources: [
        "indeed",
        "linkedin",
        "glassdoor",
        "gradcracker",
        "ukvisajobs",
      ],
    } as any);

    await discoverJobsStep({
      mergedConfig: {
        ...baseConfig,
        sources: ["linkedin", "gradcracker", "ukvisajobs"],
      },
    });

    const progress = getProgress();
    expect(progress.crawlingSourcesTotal).toBe(3);
    expect(progress.crawlingSourcesCompleted).toBe(3);
    expect(gradcrackerManifest.run).toHaveBeenCalledWith(
      expect.objectContaining({
        getExistingJobUrls: expect.any(Function),
      }),
    );

    const [{ getExistingJobUrls }] = gradcrackerManifest.run.mock.calls[0] as [
      { getExistingJobUrls: () => Promise<string[]> },
    ];
    await expect(getExistingJobUrls()).resolves.toEqual([
      "https://example.com/existing",
    ]);
  });
});
