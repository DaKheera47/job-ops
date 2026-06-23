import { describe, expect, it, vi } from "vitest";
import type { JobDateFilter, SalaryFilter } from "../constants";
import {
  formatSalarySummary,
  getDateRangeForPreset,
  getDirectionOptions,
  isSalaryFilterActive,
  toggleDimension,
} from "./filterUtils";

describe("filterUtils", () => {
  describe("toggleDimension", () => {
    const baseFilter: JobDateFilter = {
      dimensions: ["applied"],
      startDate: "2026-04-01",
      endDate: "2026-04-08",
      preset: "custom",
    };

    it("adds dimensions in canonical order", () => {
      expect(toggleDimension(baseFilter, "ready")).toEqual({
        ...baseFilter,
        dimensions: ["ready", "applied"],
      });
    });

    it("removes an active dimension", () => {
      expect(toggleDimension(baseFilter, "applied")).toEqual({
        ...baseFilter,
        dimensions: [],
      });
    });
  });

  describe("getDateRangeForPreset", () => {
    it("returns an inclusive range ending today", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-23T12:00:00"));

      expect(getDateRangeForPreset("7")).toEqual({
        startDate: "2026-06-17",
        endDate: "2026-06-23",
      });

      vi.useRealTimers();
    });
  });

  describe("getDirectionOptions", () => {
    it("uses recency labels for date fields", () => {
      expect(getDirectionOptions("datePosted")).toEqual([
        { value: "desc", label: "Most recent" },
        { value: "asc", label: "Least recent" },
      ]);
    });

    it("uses alphabetical labels for text fields", () => {
      expect(getDirectionOptions("title")).toEqual([
        { value: "asc", label: "A to Z" },
        { value: "desc", label: "Z to A" },
      ]);
    });
  });

  describe("salary helpers", () => {
    it("detects active salary filters", () => {
      expect(
        isSalaryFilterActive({ mode: "at_least", min: 60000, max: null }),
      ).toBe(true);
      expect(
        isSalaryFilterActive({ mode: "at_least", min: null, max: null }),
      ).toBe(false);
    });

    it("formats salary summaries", () => {
      const atLeast: SalaryFilter = {
        mode: "at_least",
        min: 65000,
        max: null,
      };
      expect(formatSalarySummary(atLeast)).toBe("≥ 65,000");

      const between: SalaryFilter = {
        mode: "between",
        min: 60000,
        max: 100000,
      };
      expect(formatSalarySummary(between)).toBe("60,000–100,000");

      const atMost: SalaryFilter = {
        mode: "at_most",
        min: null,
        max: 80000,
      };
      expect(formatSalarySummary(atMost)).toBe("≤ 80,000");
    });
  });
});
