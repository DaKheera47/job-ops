import { describe, expect, it } from "vitest";
import { parseUkVisaJobsProgressLine } from "./ukvisajobs";

describe("parseUkVisaJobsProgressLine", () => {
  it("parses init events", () => {
    const event = parseUkVisaJobsProgressLine(
      'JOBOPS_PROGRESS {"event":"init","maxPages":4,"maxJobs":50,"searchKeyword":"engineer"}',
    );

    expect(event).toEqual({
      type: "init",
      maxPages: 4,
      maxJobs: 50,
      searchKeyword: "engineer",
    });
  });

  it("parses page_fetched events", () => {
    const event = parseUkVisaJobsProgressLine(
      'JOBOPS_PROGRESS {"event":"page_fetched","pageNo":2,"maxPages":4,"jobsOnPage":15,"totalCollected":28,"totalAvailable":105}',
    );

    expect(event).toEqual({
      type: "page_fetched",
      pageNo: 2,
      maxPages: 4,
      jobsOnPage: 15,
      totalCollected: 28,
      totalAvailable: 105,
    });
  });

  it("parses terminal and error events", () => {
    expect(
      parseUkVisaJobsProgressLine(
        'JOBOPS_PROGRESS {"event":"empty_page","pageNo":3,"maxPages":4,"totalCollected":28}',
      ),
    ).toEqual({
      type: "empty_page",
      pageNo: 3,
      maxPages: 4,
      totalCollected: 28,
    });

    expect(
      parseUkVisaJobsProgressLine(
        'JOBOPS_PROGRESS {"event":"done","maxPages":4,"totalCollected":42,"totalAvailable":105}',
      ),
    ).toEqual({
      type: "done",
      maxPages: 4,
      totalCollected: 42,
      totalAvailable: 105,
    });

    expect(
      parseUkVisaJobsProgressLine(
        'JOBOPS_PROGRESS {"event":"error","message":"boom","pageNo":2,"status":500}',
      ),
    ).toEqual({
      type: "error",
      message: "boom",
      pageNo: 2,
      status: 500,
    });
  });

  it("ignores malformed or unrelated lines", () => {
    expect(parseUkVisaJobsProgressLine("JOBOPS_PROGRESS {bad")).toBeNull();
    expect(parseUkVisaJobsProgressLine("normal log line")).toBeNull();
  });
});
