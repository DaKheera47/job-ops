import { describe, expect, it } from "vitest";
import {
  formatPostingAgeLabel,
  getPostingDateSortValue,
} from "./job-posting-age";

const NOW = new Date("2026-05-27T12:00:00.000Z");

describe("formatPostingAgeLabel", () => {
  it("formats recent ISO timestamps as hours ago", () => {
    expect(formatPostingAgeLabel("2026-05-27T09:00:00.000Z", NOW)).toEqual(
      expect.objectContaining({
        label: "3h ago",
        inlineLabel: "Posted 3h ago",
        tone: "fresh",
      }),
    );
  });

  it("formats date-only values by calendar age", () => {
    expect(formatPostingAgeLabel("2026-05-25", NOW)).toEqual(
      expect.objectContaining({
        label: "2d ago",
        inlineLabel: "Posted 2d ago",
        tone: "fresh",
      }),
    );
  });

  it("keeps source-provided relative labels when they are not parseable dates", () => {
    expect(formatPostingAgeLabel("1 hour ago", NOW)).toEqual({
      label: "1 hour ago",
      inlineLabel: "Posted 1 hour ago",
      tooltip: "Source reported: 1 hour ago",
      tone: "fresh",
    });
  });

  it("marks jobs from 5 to 14 days old as aging", () => {
    expect(formatPostingAgeLabel("2026-05-22", NOW)).toEqual(
      expect.objectContaining({
        label: "5d ago",
        tone: "aging",
      }),
    );

    expect(formatPostingAgeLabel("2026-05-13", NOW)).toEqual(
      expect.objectContaining({
        label: "2w ago",
        tone: "aging",
      }),
    );
  });

  it("marks jobs from 15 days onward as old", () => {
    expect(formatPostingAgeLabel("2026-05-12", NOW)).toEqual(
      expect.objectContaining({
        label: "2w ago",
        tone: "old",
      }),
    );
  });

  it("hides unrecognized source strings", () => {
    expect(formatPostingAgeLabel("not a useful date", NOW)).toBeNull();
  });
});

describe("getPostingDateSortValue", () => {
  it("returns timestamps for absolute posting dates", () => {
    expect(getPostingDateSortValue("2026-05-26T12:00:00.000Z", NOW)).toBe(
      new Date("2026-05-26T12:00:00.000Z").getTime(),
    );
  });

  it("approximates source-provided relative posting ages", () => {
    expect(getPostingDateSortValue("5 days ago", NOW)).toBe(
      NOW.getTime() - 5 * 86_400_000,
    );
  });
});
