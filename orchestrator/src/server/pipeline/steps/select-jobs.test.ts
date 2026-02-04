import type { PipelineConfig } from "@shared/types";
import { describe, expect, it } from "vitest";
import { selectJobsStep } from "./select-jobs";

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
  it("filters by min score, sorts descending, and limits topN", () => {
    const jobs = [
      { id: "a", suitabilityScore: 90, suitabilityReason: "high" },
      { id: "b", suitabilityScore: 45, suitabilityReason: "low" },
      { id: "c", suitabilityScore: 80, suitabilityReason: "med" },
      { id: "d", suitabilityScore: 70, suitabilityReason: "ok" },
    ] as any;

    const selected = selectJobsStep({
      scoredJobs: jobs,
      mergedConfig: baseConfig,
    });

    expect(selected.map((job) => job.id)).toEqual(["a", "c"]);
  });
});
