import { describe, expect, it } from "vitest";
import {
  derivePostedWithinSelection,
  resolvePostedWithinDays,
} from "./automatic-run";

describe("resolvePostedWithinDays", () => {
  it("maps presets to their day counts", () => {
    expect(resolvePostedWithinDays("any", "")).toBeNull();
    expect(resolvePostedWithinDays("24h", "")).toBe(1);
    expect(resolvePostedWithinDays("7d", "")).toBe(7);
    expect(resolvePostedWithinDays("month", "")).toBe(30);
  });

  it("parses and normalizes the custom draft", () => {
    expect(resolvePostedWithinDays("custom", "10")).toBe(10);
    expect(resolvePostedWithinDays("custom", "10.9")).toBe(10);
    expect(resolvePostedWithinDays("custom", "9999")).toBe(365);
  });

  it("returns null for an empty or invalid custom draft", () => {
    expect(resolvePostedWithinDays("custom", "")).toBeNull();
    expect(resolvePostedWithinDays("custom", "abc")).toBeNull();
    expect(resolvePostedWithinDays("custom", "0")).toBeNull();
  });
});

describe("derivePostedWithinSelection", () => {
  it("maps null and presets back to their selection", () => {
    expect(derivePostedWithinSelection(null)).toEqual({
      selection: "any",
      customDraft: "",
    });
    expect(derivePostedWithinSelection(1)).toEqual({
      selection: "24h",
      customDraft: "",
    });
    expect(derivePostedWithinSelection(7)).toEqual({
      selection: "7d",
      customDraft: "",
    });
    expect(derivePostedWithinSelection(30)).toEqual({
      selection: "month",
      customDraft: "",
    });
  });

  it("maps non-preset values to the custom option", () => {
    expect(derivePostedWithinSelection(10)).toEqual({
      selection: "custom",
      customDraft: "10",
    });
  });

  it("round-trips through resolvePostedWithinDays", () => {
    for (const days of [null, 1, 7, 30, 10, 90]) {
      const { selection, customDraft } = derivePostedWithinSelection(days);
      expect(resolvePostedWithinDays(selection, customDraft)).toBe(days);
    }
  });
});
