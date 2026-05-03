import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/run", () => ({
  runJobindex: vi.fn(),
}));

describe("jobindex manifest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards Denmark automatic-run settings to the runner", async () => {
    const { manifest } = await import("../src/manifest");
    const { runJobindex } = await import("../src/run");
    const runJobindexMock = vi.mocked(runJobindex);
    runJobindexMock.mockResolvedValue({
      success: true,
      jobs: [],
    });

    await manifest.run({
      source: "jobindex",
      selectedSources: ["jobindex"],
      settings: {
        jobindexMaxJobsPerTerm: "70",
      },
      searchTerms: ["software engineer"],
      selectedCountry: "denmark",
    });

    expect(runJobindexMock).toHaveBeenCalledWith(
      expect.objectContaining({
        maxJobsPerTerm: 70,
        selectedCountry: "denmark",
      }),
    );
  });

  it("does not call the runner outside Denmark", async () => {
    const { manifest } = await import("../src/manifest");
    const { runJobindex } = await import("../src/run");

    const result = await manifest.run({
      source: "jobindex",
      selectedSources: ["jobindex"],
      settings: {},
      searchTerms: ["software engineer"],
      selectedCountry: "germany",
    });

    expect(result).toEqual({ success: true, jobs: [] });
    expect(runJobindex).not.toHaveBeenCalled();
  });
});
