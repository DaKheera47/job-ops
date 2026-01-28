/**
 * Tests for server-side scanner validation in the pipeline orchestrator.
 *
 * These tests verify that the orchestrator respects scanner enabled flags
 * even when the client sends disabled scanners in the sources array.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependencies to prevent side effects
vi.mock("../repositories/jobs.js", () => ({
  updateJob: vi.fn(),
  getUnscoredDiscoveredJobs: vi.fn(),
  getJobById: vi.fn(),
  bulkCreateJobs: vi.fn(),
  getAllJobUrls: vi.fn(),
}));

vi.mock("../repositories/pipeline.js", () => ({
  createPipelineRun: vi.fn(() => ({ id: "test-run-id" })),
  updatePipelineRun: vi.fn(),
}));

vi.mock("../repositories/settings.js", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
  getAllSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock("../services/crawler.js", () => ({
  runCrawler: vi.fn(() => ({ success: true, jobs: [] })),
}));

vi.mock("../services/jobspy.js", () => ({
  runJobSpy: vi.fn(() => ({ success: true, jobs: [] })),
}));

vi.mock("../services/ukvisajobs.js", () => ({
  runUkVisaJobs: vi.fn(() => ({ success: true, jobs: [] })),
}));

vi.mock("../services/profile.js", () => ({
  getProfile: vi.fn(() => Promise.resolve({})),
}));

vi.mock("../services/scorer.js", () => ({
  scoreJobSuitability: vi.fn(() => ({ score: 75, reason: "Good match" })),
}));

vi.mock("../services/visa-sponsors/index.js", () => ({
  searchSponsors: vi.fn(() => []),
  calculateSponsorMatchSummary: vi.fn(() => ({
    sponsorMatchScore: 0,
    sponsorMatchNames: null,
  })),
}));

describe("Server-side scanner validation", () => {
  let runCrawler: ReturnType<typeof vi.fn>;
  let runJobSpy: ReturnType<typeof vi.fn>;
  let runUkVisaJobs: ReturnType<typeof vi.fn>;
  let getAllSettings: ReturnType<typeof vi.fn>;
  let bulkCreateJobs: ReturnType<typeof vi.fn>;
  let getUnscoredDiscoveredJobs: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get mocked functions
    const crawler = await import("../services/crawler.js");
    const jobspy = await import("../services/jobspy.js");
    const ukvisajobs = await import("../services/ukvisajobs.js");
    const settingsRepo = await import("../repositories/settings.js");
    const jobsRepo = await import("../repositories/jobs.js");

    runCrawler = crawler.runCrawler as ReturnType<typeof vi.fn>;
    runJobSpy = jobspy.runJobSpy as ReturnType<typeof vi.fn>;
    runUkVisaJobs = ukvisajobs.runUkVisaJobs as ReturnType<typeof vi.fn>;
    getAllSettings = settingsRepo.getAllSettings as ReturnType<typeof vi.fn>;
    bulkCreateJobs = jobsRepo.bulkCreateJobs as ReturnType<typeof vi.fn>;
    getUnscoredDiscoveredJobs =
      jobsRepo.getUnscoredDiscoveredJobs as ReturnType<typeof vi.fn>;

    // Default mock implementations
    runCrawler.mockResolvedValue({ success: true, jobs: [] });
    runJobSpy.mockResolvedValue({ success: true, jobs: [] });
    runUkVisaJobs.mockResolvedValue({ success: true, jobs: [] });
    bulkCreateJobs.mockResolvedValue({ created: 0, skipped: 0 });
    getUnscoredDiscoveredJobs.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("skips disabled scanners even if client sends them", () => {
    it("should skip Gradcracker when gradcrackerEnabled is false", async () => {
      // Mock settings with gradcrackerEnabled=false (stored as '0' in DB)
      getAllSettings.mockResolvedValue({
        gradcrackerEnabled: "0",
      });

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["gradcracker"],
        enableCrawling: true,
      });

      // Verify Gradcracker crawler was NOT executed
      expect(runCrawler).not.toHaveBeenCalled();
    });

    it("should skip UKVisaJobs when ukvisajobsEnabled is false", async () => {
      // Mock settings with ukvisajobsEnabled=false (stored as '0' in DB)
      getAllSettings.mockResolvedValue({
        ukvisajobsEnabled: "false",
      });

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["ukvisajobs"],
        enableCrawling: true,
      });

      // Verify UKVisaJobs crawler was NOT executed
      expect(runUkVisaJobs).not.toHaveBeenCalled();
    });

    it("should skip Indeed when indeedEnabled is false", async () => {
      // Mock settings with indeedEnabled=false
      getAllSettings.mockResolvedValue({
        indeedEnabled: "no",
      });

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["indeed"],
        enableCrawling: true,
      });

      // Verify JobSpy was NOT called with Indeed
      expect(runJobSpy).not.toHaveBeenCalled();
    });

    it("should skip LinkedIn when linkedinEnabled is false", async () => {
      // Mock settings with linkedinEnabled=false
      getAllSettings.mockResolvedValue({
        linkedinEnabled: "0",
      });

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["linkedin"],
        enableCrawling: true,
      });

      // Verify JobSpy was NOT called with LinkedIn
      expect(runJobSpy).not.toHaveBeenCalled();
    });

    it("should skip multiple disabled scanners", async () => {
      // Mock settings with multiple scanners disabled
      getAllSettings.mockResolvedValue({
        gradcrackerEnabled: "0",
        ukvisajobsEnabled: "false",
        indeedEnabled: "no",
        linkedinEnabled: "0",
      });

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["gradcracker", "ukvisajobs", "indeed", "linkedin"],
        enableCrawling: true,
      });

      // Verify NO scanners were executed
      expect(runCrawler).not.toHaveBeenCalled();
      expect(runUkVisaJobs).not.toHaveBeenCalled();
      expect(runJobSpy).not.toHaveBeenCalled();
    });
  });

  describe("enabled scanners still run normally", () => {
    it("should run all scanners when enabled flags are true", async () => {
      // Mock settings with all scanners enabled
      getAllSettings.mockResolvedValue({
        gradcrackerEnabled: "1",
        ukvisajobsEnabled: "true",
        indeedEnabled: "yes",
        linkedinEnabled: "1",
      });

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["gradcracker", "ukvisajobs", "indeed", "linkedin"],
        enableCrawling: true,
      });

      // Verify all scanners were executed
      expect(runCrawler).toHaveBeenCalled();
      expect(runUkVisaJobs).toHaveBeenCalled();
      expect(runJobSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sites: ["indeed", "linkedin"],
        }),
      );
    });

    it("should run enabled scanners when defaults are used (no settings)", async () => {
      // Mock empty settings (defaults to true)
      getAllSettings.mockResolvedValue({});

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["gradcracker", "ukvisajobs", "indeed", "linkedin"],
        enableCrawling: true,
      });

      // Verify all scanners were executed (defaulting to enabled)
      expect(runCrawler).toHaveBeenCalled();
      expect(runUkVisaJobs).toHaveBeenCalled();
      expect(runJobSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sites: ["indeed", "linkedin"],
        }),
      );
    });

    it("should run Gradcracker when gradcrackerEnabled is true", async () => {
      getAllSettings.mockResolvedValue({
        gradcrackerEnabled: "1",
      });

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["gradcracker"],
        enableCrawling: true,
      });

      expect(runCrawler).toHaveBeenCalled();
    });

    it("should run UKVisaJobs when ukvisajobsEnabled is true", async () => {
      getAllSettings.mockResolvedValue({
        ukvisajobsEnabled: "true",
      });

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["ukvisajobs"],
        enableCrawling: true,
      });

      expect(runUkVisaJobs).toHaveBeenCalled();
    });

    it("should filter JobSpy sites based on enabled flags", async () => {
      // Enable Indeed but disable LinkedIn
      getAllSettings.mockResolvedValue({
        indeedEnabled: "1",
        linkedinEnabled: "0",
      });

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["indeed", "linkedin"],
        enableCrawling: true,
      });

      // Verify JobSpy was called with only Indeed
      expect(runJobSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          sites: ["indeed"],
        }),
      );
    });

    it("should not run JobSpy when all sites are disabled", async () => {
      // Disable both Indeed and LinkedIn
      getAllSettings.mockResolvedValue({
        indeedEnabled: "0",
        linkedinEnabled: "0",
      });

      const { runPipeline } = await import("./orchestrator.js");
      await runPipeline({
        sources: ["indeed", "linkedin"],
        enableCrawling: true,
      });

      // Verify JobSpy was NOT called
      expect(runJobSpy).not.toHaveBeenCalled();
    });
  });
});
