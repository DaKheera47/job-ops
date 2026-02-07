import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_PRESETS,
  calculateAutomaticEstimate,
  parseSearchTermsInput,
} from "./automatic-run";

describe("automatic-run utilities", () => {
  it("exposes the expected preset values", () => {
    expect(AUTOMATIC_PRESETS.fast).toEqual({
      topN: 5,
      minSuitabilityScore: 75,
      jobspyResultsWanted: 60,
      gradcrackerMaxJobsPerTerm: 25,
      ukvisajobsMaxJobs: 25,
    });

    expect(AUTOMATIC_PRESETS.detailed.topN).toBeGreaterThan(
      AUTOMATIC_PRESETS.fast.topN,
    );
  });

  it("calculates estimate range with source caps and topN clipping", () => {
    const estimate = calculateAutomaticEstimate({
      values: {
        topN: 10,
        minSuitabilityScore: 50,
        searchTerms: ["backend", "platform"],
        jobspyResultsWanted: 100,
        gradcrackerMaxJobsPerTerm: 40,
        ukvisajobsMaxJobs: 30,
      },
      sources: ["indeed", "linkedin", "gradcracker", "ukvisajobs"],
    });

    expect(estimate.discovered.cap).toBe(510);
    expect(estimate.discovered.min).toBe(179);
    expect(estimate.discovered.max).toBe(383);
    expect(estimate.processed.min).toBe(10);
    expect(estimate.processed.max).toBe(10);
  });

  it("parses comma and newline separated search terms", () => {
    expect(parseSearchTermsInput("backend, platform\napi\n\n")).toEqual([
      "backend",
      "platform",
      "api",
    ]);
  });
});

