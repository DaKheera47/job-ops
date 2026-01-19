import { describe, expect, it } from "vitest";

import { createJob } from "./fixtures";
import { formatDateTime, resolveHubState, stripHtml } from "../utils";

describe("JobFlowModal utils", () => {
  it("strips HTML safely", () => {
    expect(stripHtml("<p>Hello <strong>World</strong></p>")).toBe("Hello World");
  });

  it("formats date strings with fallback", () => {
    expect(formatDateTime(null)).toBe("Not yet");
    expect(formatDateTime("2025-01-02T09:15:00Z")).toContain("Jan");
  });

  it("resolves hub states from job status", () => {
    expect(resolveHubState(createJob({ status: "applied" }))).toBe("applied");
    expect(resolveHubState(createJob({ status: "ready", applicationLink: null }))).toBe("prepared");
    expect(resolveHubState(createJob({ status: "ready", applicationLink: "https://apply" }))).toBe("applying");
    expect(resolveHubState(createJob({ status: "processing" }))).toBe("prepared");
    expect(resolveHubState(createJob({ status: "expired" }))).toBe("closed");
    expect(resolveHubState(createJob({ status: "discovered", suitabilityScore: 75 }))).toBe("qualified");
    expect(resolveHubState(createJob({ status: "discovered", suitabilityScore: 60 }))).toBe("discovered");
  });
});
