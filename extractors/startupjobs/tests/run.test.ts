import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("startup-jobs-scraper", () => ({
  scrapeStartupJobsViaAlgolia: vi.fn(),
}));

describe("runStartupJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("falls back to the default max jobs per term when options.maxJobsPerTerm is NaN", async () => {
    const { scrapeStartupJobsViaAlgolia } = await import(
      "startup-jobs-scraper"
    );
    const scrapeMock = vi.mocked(scrapeStartupJobsViaAlgolia);
    scrapeMock.mockResolvedValueOnce([]);

    const { runStartupJobs } = await import("../src/run");

    await runStartupJobs({
      searchTerms: ["backend engineer"],
      maxJobsPerTerm: Number.NaN,
    });

    expect(scrapeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        requestedCount: 50,
      }),
    );
  });

  it("drops broad location sentinels and falls back to selectedCountry behavior", async () => {
    const { scrapeStartupJobsViaAlgolia } = await import(
      "startup-jobs-scraper"
    );
    const scrapeMock = vi.mocked(scrapeStartupJobsViaAlgolia);
    scrapeMock.mockResolvedValueOnce([]);

    const { runStartupJobs } = await import("../src/run");

    await runStartupJobs({
      searchTerms: ["platform engineer"],
      selectedCountry: "worldwide",
      locations: ["Worldwide"],
    });

    expect(scrapeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        location: undefined,
      }),
    );
  });

  it("normalizes explicit city-country aliases before passing location to the scraper", async () => {
    const { scrapeStartupJobsViaAlgolia } = await import(
      "startup-jobs-scraper"
    );
    const scrapeMock = vi.mocked(scrapeStartupJobsViaAlgolia);
    scrapeMock.mockResolvedValueOnce([]);

    const { runStartupJobs } = await import("../src/run");

    await runStartupJobs({
      searchTerms: ["software engineer"],
      locations: ["UK"],
    });

    expect(scrapeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        location: "United Kingdom",
      }),
    );
  });

  it("passes workplaceType to the scraper", async () => {
    const { scrapeStartupJobsViaAlgolia } = await import(
      "startup-jobs-scraper"
    );
    const scrapeMock = vi.mocked(scrapeStartupJobsViaAlgolia);
    scrapeMock.mockResolvedValueOnce([]);

    const { runStartupJobs } = await import("../src/run");

    await runStartupJobs({
      searchTerms: ["software engineer"],
      workplaceTypes: ["remote", "hybrid"],
    });

    expect(scrapeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workplaceType: ["remote", "hybrid"],
      }),
    );
  });

  it("maps onsite workplaceType to the scraper's on-site value", async () => {
    const { scrapeStartupJobsViaAlgolia } = await import(
      "startup-jobs-scraper"
    );
    const scrapeMock = vi.mocked(scrapeStartupJobsViaAlgolia);
    scrapeMock.mockResolvedValueOnce([]);

    const { runStartupJobs } = await import("../src/run");

    await runStartupJobs({
      searchTerms: ["software engineer"],
      workplaceTypes: ["onsite"],
    });

    expect(scrapeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        workplaceType: ["on-site"],
      }),
    );
  });
});
