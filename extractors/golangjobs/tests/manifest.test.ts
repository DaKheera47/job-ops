import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/run", () => ({
  runGolangJobs: vi.fn(),
}));

describe("golangjobs manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards automatic-run settings to the runner", async () => {
    const { manifest } = await import("../src/manifest");
    const { runGolangJobs } = await import("../src/run");
    const runGolangJobsMock = vi.mocked(runGolangJobs);
    runGolangJobsMock.mockResolvedValue({
      success: true,
      jobs: [],
    });

    await manifest.run({
      source: "golangjobs",
      selectedSources: ["golangjobs"],
      settings: {
        jobspyResultsWanted: "70",
        workplaceTypes: '["remote","hybrid"]',
        searchCities: "Berlin",
      },
      searchTerms: ["backend engineer"],
      selectedCountry: "germany",
    });

    expect(runGolangJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxJobsPerTerm: 70,
        workplaceTypes: ["remote", "hybrid"],
        locations: ["Berlin"],
        selectedCountry: "germany",
      }),
    );
  });
});
