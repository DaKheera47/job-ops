import { describe, expect, it } from "vitest";
import { parseJobSpyProgressLine } from "./jobspy";

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
