import { describe, expect, it } from "vitest";
import {
  AUTOMATIC_PRESETS,
  calculateAutomaticEstimate,
  deriveExtractorLimits,
  parseSearchTermsInput,
} from "./automatic-run";

describe("automatic-run utilities", () => {
  it("exposes the expected preset values", () => {
    expect(AUTOMATIC_PRESETS.fast).toEqual({
      topN: 5,
      minSuitabilityScore: 75,
      runBudget: 300,
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
        runBudget: 100,
        country: "united kingdom",
      },
      sources: ["indeed", "linkedin", "gradcracker", "ukvisajobs"],
    });

    expect(estimate.discovered.cap).toBe(100);
    expect(estimate.discovered.min).toBe(35);
    expect(estimate.discovered.max).toBe(75);
    expect(estimate.processed.min).toBe(10);
    expect(estimate.processed.max).toBe(10);
  });

  it("keeps discovered cap under budget regardless of search-term count", () => {
    const limits = deriveExtractorLimits({
      budget: 750,
      searchTerms: ["a", "b", "c"],
      sources: ["indeed", "linkedin", "gradcracker"],
    });

    const cap =
      2 * limits.jobspyResultsWanted * 3 + limits.gradcrackerMaxJobsPerTerm * 3;

    expect(cap).toBeLessThanOrEqual(750);
  });

  it("returns zero estimate when no search terms are provided", () => {
    const estimate = calculateAutomaticEstimate({
      values: {
        topN: 10,
        minSuitabilityScore: 50,
        searchTerms: [],
        runBudget: 750,
        country: "united kingdom",
      },
      sources: ["indeed", "linkedin", "gradcracker", "ukvisajobs"],
    });

    expect(estimate).toEqual({
      discovered: { min: 0, max: 0, cap: 0 },
      processed: { min: 0, max: 0 },
    });
  });

  it("parses comma and newline separated search terms", () => {
    expect(parseSearchTermsInput("backend, platform\napi\n\n")).toEqual([
      "backend",
      "platform",
      "api",
    ]);
  });
});
