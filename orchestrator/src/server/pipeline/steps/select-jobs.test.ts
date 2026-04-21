import type { PipelineConfig } from "@shared/types";
import { describe, expect, it, vi } from "vitest";
import { selectJobsStep } from "./select-jobs";

vi.mock("@server/repositories/settings", () => ({
  getAllSettings: vi.fn().mockResolvedValue({}),
}));

const baseConfig: PipelineConfig = {
  topN: 2,
  minSuitabilityScore: 50,
  sources: ["gradcracker"],
  outputDir: "./tmp",
  enableCrawling: true,
  enableScoring: true,
  enableImporting: true,
  enableAutoTailoring: true,
};

describe("selectJobsStep", () => {
  it("filters by min score, sorts descending, and limits topN", async () => {
    const jobs = [
      { id: "a", suitabilityScore: 90, suitabilityReason: "high" },
      { id: "b", suitabilityScore: 45, suitabilityReason: "low" },
      { id: "c", suitabilityScore: 80, suitabilityReason: "med" },
      { id: "d", suitabilityScore: 70, suitabilityReason: "ok" },
    ] as any;

    const selected = await selectJobsStep({
      scoredJobs: jobs,
      mergedConfig: baseConfig,
    });

    expect(selected.map((job) => job.id)).toEqual(["a", "c"]);
  });

  it("breaks score ties toward selected locations when requested", async () => {
    const settingsRepo = await import("@server/repositories/settings");
    vi.mocked(settingsRepo.getAllSettings).mockResolvedValue({
      locationSearchScope: "remote_worldwide_prioritize_selected",
      jobspyCountryIndeed: "croatia",
      searchCities: "Zagreb",
    } as any);

    const jobs = [
      {
        id: "remote-anywhere",
        suitabilityScore: 80,
        suitabilityReason: "tie",
        location: "Remote - Worldwide",
      },
      {
        id: "zagreb",
        suitabilityScore: 80,
        suitabilityReason: "tie",
        location: null,
        locationEvidence: {
          location: "Zagreb, Croatia",
          country: "croatia",
        },
      },
    ] as any;

    const selected = await selectJobsStep({
      scoredJobs: jobs,
      mergedConfig: { ...baseConfig, topN: 1 },
    });

    expect(selected.map((job) => job.id)).toEqual(["zagreb"]);
  });
});
