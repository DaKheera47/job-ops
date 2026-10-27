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

  it("keeps date-only postings on their local calendar date", () => {
    const now = new Date(2026, 4, 27, 12);
    expect(formatPostingAgeLabel("2026-05-25", now)).toEqual(
      expect.objectContaining({
        label: "2d ago",
        tooltip: "Source posting date: 25 May 2026",
      }),
    );
    expect(formatPostingAgeLabel("2026-05-13", now)?.tone).toBe("aging");
  });

  it.each([
    [2026, 2, 9],
    [2026, 10, 2],
    [2026, 2, 30],
    [2026, 9, 26],
  ])("counts calendar days across clock changes (%i-%i-%i)", (year, month, day) => {
    const now = new Date(year, month, day, 12);
    const yesterday = new Date(year, month, day - 1, 12);
    const fiveDaysAgo = new Date(year, month, day - 5, 12);
    expect(formatPostingAgeLabel(yesterday.toISOString(), now)).toEqual(
      expect.objectContaining({ label: "yesterday", tone: "fresh" }),
    );
    expect(formatPostingAgeLabel(fiveDaysAgo.toISOString(), now)).toEqual(
      expect.objectContaining({ label: "5d ago", tone: "aging" }),
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

  it("sorts date-only postings at local midnight", () => {
    expect(getPostingDateSortValue("2026-05-25", NOW)).toBe(
      new Date(2026, 4, 25).getTime(),
    );
  });

  it("approximates source-provided relative posting ages", () => {
    expect(getPostingDateSortValue("5 days ago", NOW)).toBe(
      NOW.getTime() - 5 * 86_400_000,
    );
  });
});
