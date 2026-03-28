import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/run", () => ({
  runWorkingNomads: vi.fn(),
}));

describe("workingnomads manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards automatic-run settings to the runner", async () => {
    const { manifest } = await import("../src/manifest");
    const { runWorkingNomads } = await import("../src/run");
    const runWorkingNomadsMock = vi.mocked(runWorkingNomads);
    runWorkingNomadsMock.mockResolvedValue({
      success: true,
      jobs: [],
    });

    await manifest.run({
      source: "workingnomads",
      selectedSources: ["workingnomads"],
      settings: {
        jobspyResultsWanted: "70",
        workplaceTypes: '["remote","hybrid"]',
        searchCities: "Berlin",
      },
      searchTerms: ["backend engineer"],
      selectedCountry: "germany",
    });

    expect(runWorkingNomadsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxJobsPerTerm: 70,
        workplaceTypes: ["remote", "hybrid"],
        locations: ["Berlin"],
        selectedCountry: "germany",
      }),
    );
  });
});
