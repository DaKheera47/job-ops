import { beforeEach, describe, expect, it, vi } from "vitest";
import { runNaukri } from "../src/run";

vi.mock("../src/run", () => ({
  runNaukri: vi.fn(),
}));

describe("naukri manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(runNaukri).mockResolvedValue({ success: true, jobs: [] });
  });

  it("registers the naukri source", async () => {
    const { manifest } = await import("../manifest");

    expect(manifest.id).toBe("naukri");
    expect(manifest.displayName).toBe("Naukri");
    expect(manifest.providesSources).toEqual(["naukri"]);
  });

  it("passes app runtime controls into runNaukri", async () => {
    const { manifest } = await import("../manifest");
    const onProgress = vi.fn();
    const shouldCancel = vi.fn(() => false);
    const getExistingJobUrls = vi
      .fn()
      .mockResolvedValue(["https://www.naukri.com/existing"]);

    await manifest.run({
      source: "naukri",
      selectedSources: ["naukri"],
      selectedCountry: "india",
      searchTerms: ["backend engineer"],
      settings: {
        naukriMaxJobsPerTerm: "12",
        searchCities: "Pune|Bengaluru",
      },
      getExistingJobUrls,
      shouldCancel,
      onProgress,
    });

    expect(getExistingJobUrls).toHaveBeenCalledOnce();
    expect(runNaukri).toHaveBeenCalledWith(
      expect.objectContaining({
        searchTerms: ["backend engineer"],
        locations: ["Pune", "Bengaluru"],
        existingJobUrls: ["https://www.naukri.com/existing"],
        maxJobsPerTerm: 12,
        shouldCancel,
      }),
    );
  });

  it("surfaces challenge-required failures", async () => {
    vi.mocked(runNaukri).mockResolvedValueOnce({
      success: false,
      jobs: [],
      challengeRequired: "https://www.naukri.com/software-engineer-jobs",
    });

    const { manifest } = await import("../manifest");
    const result = await manifest.run({
      source: "naukri",
      selectedSources: ["naukri"],
      selectedCountry: "india",
      searchTerms: ["software engineer"],
      settings: {},
    });

    expect(result).toEqual({
      success: false,
      jobs: [],
      error: undefined,
      challengeRequired: "https://www.naukri.com/software-engineer-jobs",
    });
  });
});
