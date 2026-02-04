import type { PipelineConfig } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
});
