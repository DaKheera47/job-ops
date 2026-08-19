import { describe, expect, it } from "vitest";
import { getPostingDateSortValue, isPostedWithinDays } from "./job-posting-age";
import { normalizePostedWithinDays } from "./types/pipeline";

const NOW = Date.parse("2026-06-10T12:00:00.000Z");

describe("getPostingDateSortValue", () => {
  it("parses absolute ISO dates", () => {
    expect(getPostingDateSortValue("2026-06-08T12:00:00.000Z")).toBe(
      Date.parse("2026-06-08T12:00:00.000Z"),
    );
  });

  it("resolves relative phrases against now", () => {
    expect(getPostingDateSortValue("5 days ago", new Date(NOW))).toBe(
      NOW - 5 * 86_400_000,
    );
  });

  it("returns null for missing or unparseable dates", () => {
    expect(getPostingDateSortValue(null)).toBeNull();
    expect(getPostingDateSortValue("   ")).toBeNull();
    expect(getPostingDateSortValue("whenever")).toBeNull();
  });
});

describe("isPostedWithinDays", () => {
  it("keeps jobs posted inside the window", () => {
    expect(isPostedWithinDays("2026-06-08", 7, NOW)).toBe(true);
    expect(isPostedWithinDays("2 days ago", 7, NOW)).toBe(true);
  });

  it("drops jobs posted before the window", () => {
    expect(isPostedWithinDays("2026-05-20", 7, NOW)).toBe(false);
    expect(isPostedWithinDays("20 days ago", 7, NOW)).toBe(false);
  });

  it("excludes jobs with unknown dates (strict semantics)", () => {
    expect(isPostedWithinDays(null, 7, NOW)).toBe(false);
    expect(isPostedWithinDays("not a date", 7, NOW)).toBe(false);
  });

  it("treats a non-positive window as no filter", () => {
    expect(isPostedWithinDays(null, 0, NOW)).toBe(true);
    expect(isPostedWithinDays("2020-01-01", -3, NOW)).toBe(true);
  });
});

describe("normalizePostedWithinDays", () => {
  it("treats null, undefined and non-positive values as any time", () => {
    expect(normalizePostedWithinDays(null)).toBeNull();
    expect(normalizePostedWithinDays(undefined)).toBeNull();
    expect(normalizePostedWithinDays(0)).toBeNull();
    expect(normalizePostedWithinDays(-4)).toBeNull();
    expect(normalizePostedWithinDays(Number.NaN)).toBeNull();
  });

  it("rounds and clamps positive values", () => {
    expect(normalizePostedWithinDays(7)).toBe(7);
    expect(normalizePostedWithinDays(7.6)).toBe(8);
    expect(normalizePostedWithinDays(5000)).toBe(365);
  });
});
