import { describe, expect, it } from "vitest";
import {
  matchesRequestedLocation,
  parseJobSpyProgressLine,
  shouldApplyStrictLocationFilter,
} from "./jobspy";

describe("parseJobSpyProgressLine", () => {
  it("parses term_start progress lines", () => {
    const event = parseJobSpyProgressLine(
      'JOBOPS_PROGRESS {"event":"term_start","termIndex":1,"termTotal":3,"searchTerm":"engineer"}',
    );

    expect(event).toEqual({
      type: "term_start",
      termIndex: 1,
      termTotal: 3,
      searchTerm: "engineer",
    });
  });

  it("parses term_complete progress lines", () => {
    const event = parseJobSpyProgressLine(
      'JOBOPS_PROGRESS {"event":"term_complete","termIndex":2,"termTotal":3,"searchTerm":"frontend","jobsFoundTerm":17}',
    );

    expect(event).toEqual({
      type: "term_complete",
      termIndex: 2,
      termTotal: 3,
      searchTerm: "frontend",
      jobsFoundTerm: 17,
    });
  });

  it("returns null for malformed payloads", () => {
    expect(parseJobSpyProgressLine("JOBOPS_PROGRESS {bad json")).toBeNull();
    expect(parseJobSpyProgressLine("JOBOPS_PROGRESS {}")).toBeNull();
  });

  it("returns null for non-progress lines", () => {
    expect(parseJobSpyProgressLine("Found 20 jobs")).toBeNull();
  });
});

describe("strict location filtering", () => {
  it("enables strict filtering when location differs from country", () => {
    expect(shouldApplyStrictLocationFilter("Leeds", "united kingdom")).toBe(
      true,
    );
  });

  it("disables strict filtering when location is country-level", () => {
    expect(shouldApplyStrictLocationFilter("UK", "united kingdom")).toBe(false);
    expect(shouldApplyStrictLocationFilter("United States", "us")).toBe(false);
  });

  it("matches location using case-insensitive contains checks", () => {
    expect(matchesRequestedLocation("Leeds, England, UK", "leeds")).toBe(true);
    expect(matchesRequestedLocation("Halifax, England, UK", "leeds")).toBe(
      false,
    );
    expect(matchesRequestedLocation(undefined, "leeds")).toBe(false);
  });
});
