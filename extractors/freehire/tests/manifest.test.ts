import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/run", () => ({
  runFreeHire: vi.fn(),
}));

describe("freehire manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards shared automatic-run settings", async () => {
    const { manifest } = await import("../src/manifest");
    const { runFreeHire } = await import("../src/run");
    vi.mocked(runFreeHire).mockResolvedValue({ success: true, jobs: [] });

    await manifest.run({
      source: "freehire",
      selectedSources: ["freehire"],
      settings: {
        jobspyResultsWanted: "70",
        workplaceTypes: '["remote","hybrid"]',
        searchCities: "London",
      },
      searchTerms: ["backend engineer"],
      selectedCountry: "uk",
    });

    expect(runFreeHire).toHaveBeenCalledWith(
      expect.objectContaining({
        maxJobsPerTerm: 70,
        workplaceTypes: ["remote", "hybrid"],
        locations: ["London"],
        selectedCountry: "uk",
      }),
    );
  });
});
