import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/run", () => ({
  runEuroJobs: vi.fn(),
}));

describe("eurojobs manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards shared automatic-run settings", async () => {
    const { manifest } = await import("../src/manifest");
    const { runEuroJobs } = await import("../src/run");
    vi.mocked(runEuroJobs).mockResolvedValue({ success: true, jobs: [] });

    await manifest.run({
      source: "eurojobs",
      selectedSources: ["eurojobs"],
      settings: {
        jobspyResultsWanted: "70",
        workplaceTypes: '["remote","hybrid"]',
        searchCities: "Berlin",
      },
      searchTerms: ["backend engineer"],
      selectedCountry: "germany",
      getExistingJobUrls: async () => ["https://eurojobs.ai/jobs/known"],
    });

    expect(runEuroJobs).toHaveBeenCalledWith(
      expect.objectContaining({
        searchTerms: ["backend engineer"],
        maxJobsPerTerm: 70,
        workplaceTypes: ["remote", "hybrid"],
        locations: ["Berlin"],
        selectedCountry: "germany",
        existingJobUrls: ["https://eurojobs.ai/jobs/known"],
      }),
    );
  });

  it("is limited to European countries", async () => {
    const { manifest } = await import("../src/manifest");
    const countries =
      manifest.locationCapabilities?.eurojobs?.supportedCountryKeys ?? [];

    expect(countries).toEqual(
      expect.arrayContaining([
        "germany",
        "united kingdom",
        "switzerland",
        "norway",
      ]),
    );
    expect(countries).not.toContain("united states");
  });
});
