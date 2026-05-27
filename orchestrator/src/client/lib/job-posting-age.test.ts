import { describe, expect, it } from "vitest";
import { formatPostingAgeLabel } from "./job-posting-age";

const NOW = new Date("2026-05-27T12:00:00.000Z");

describe("formatPostingAgeLabel", () => {
  it("formats recent ISO timestamps as hours ago", () => {
    expect(formatPostingAgeLabel("2026-05-27T09:00:00.000Z", NOW)).toEqual(
      expect.objectContaining({
        label: "3h ago",
        inlineLabel: "Posted 3h ago",
      }),
    );
  });

  it("formats date-only values by calendar age", () => {
    expect(formatPostingAgeLabel("2026-05-25", NOW)).toEqual(
      expect.objectContaining({
        label: "2d ago",
        inlineLabel: "Posted 2d ago",
      }),
    );
  });

  it("keeps source-provided relative labels when they are not parseable dates", () => {
    expect(formatPostingAgeLabel("1 hour ago", NOW)).toEqual({
      label: "1 hour ago",
      inlineLabel: "Posted 1 hour ago",
      tooltip: "Source reported: 1 hour ago",
    });
  });

  it("hides unrecognized source strings", () => {
    expect(formatPostingAgeLabel("not a useful date", NOW)).toBeNull();
  });
});
