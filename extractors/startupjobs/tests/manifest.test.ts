import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/run", () => ({
  runStartupJobs: vi.fn(),
}));

describe("startupjobs manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers startupjobsMaxJobsPerTerm when provided", async () => {
    const { manifest } = await import("../src/manifest");
    const { runStartupJobs } = await import("../src/run");
    const runStartupJobsMock = vi.mocked(runStartupJobs);
    runStartupJobsMock.mockResolvedValue({
      success: true,
      jobs: [],
    });

    await manifest.run({
      source: "startupjobs",
      selectedSources: ["startupjobs"],
      settings: {
        startupjobsMaxJobsPerTerm: "70",
        jobspyResultsWanted: "30",
      },
      searchTerms: ["software engineer"],
      selectedCountry: "united kingdom",
    });

    expect(runStartupJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxJobsPerTerm: 70,
      }),
    );
  });
});
