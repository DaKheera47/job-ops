import { describe, expect, it } from "vitest";
import {
  applySummaryTextareaHeight,
  collapseTrailingBlankLines,
  formatTextCount,
  measureTailorTextareaHeight,
  shouldPreserveManualHeight,
  TAILOR_TEXTAREA_MAX_HEIGHT_PX,
  TAILOR_TEXTAREA_MIN_HEIGHT_PX,
} from "./summary-text-metrics";

describe("summary-text-metrics", () => {
  it("formats word and character counts including empty and emoji text", () => {
    expect(formatTextCount("", "words")).toBe("0 words");
    expect(formatTextCount("   ", "words")).toBe("0 words");
    expect(formatTextCount("hi", "words")).toBe("1 word");
    expect(formatTextCount("  one  two\nthree  ", "words")).toBe("3 words");
    expect(formatTextCount("", "characters")).toBe("0 characters");
    expect(formatTextCount("a", "characters")).toBe("1 character");
    expect(formatTextCount("a b", "characters")).toBe("3 characters");
    expect(formatTextCount("hi👋", "characters")).toBe("3 characters");
  });

  it("clamps tailoring textarea height between min and max", () => {
    expect(measureTailorTextareaHeight(40)).toBe(TAILOR_TEXTAREA_MIN_HEIGHT_PX);
    expect(measureTailorTextareaHeight(180)).toBe(180);
    expect(measureTailorTextareaHeight(400)).toBe(
      TAILOR_TEXTAREA_MAX_HEIGHT_PX,
    );
  });

  it("collapses trailing blank lines for height measurement", () => {
    expect(collapseTrailingBlankLines("hello\n\n\n")).toBe("hello");
    expect(collapseTrailingBlankLines("hello\nworld\n")).toBe("hello\nworld");
    expect(collapseTrailingBlankLines("\n\n")).toBe("");
  });

  it("measures shorter when collapsing trailing blank lines", () => {
    const textarea = document.createElement("textarea");
    Object.defineProperty(textarea, "offsetHeight", {
      configurable: true,
      get: () => Number.parseFloat(textarea.style.height || "0") || 140,
    });
    Object.defineProperty(textarea, "clientHeight", {
      configurable: true,
      get: () => Number.parseFloat(textarea.style.height || "0") || 140,
    });
    Object.defineProperty(textarea, "scrollHeight", {
      configurable: true,
      get: () => (textarea.value.match(/\n/g)?.length ?? 0) * 20 + 40,
    });

    textarea.value = "hello\n\n\n\n\n";
    const withBlanks = applySummaryTextareaHeight(textarea);
    const collapsed = applySummaryTextareaHeight(textarea, true);

    expect(collapsed).toBeLessThan(withBlanks);
    expect(textarea.value).toBe("hello\n\n\n\n\n");
  });

  it("preserves any manual height until returned to the minimum", () => {
    expect(shouldPreserveManualHeight(180, 180)).toBe(false);
    expect(shouldPreserveManualHeight(180, 181)).toBe(true);
    expect(shouldPreserveManualHeight(180, 600)).toBe(true);
    expect(shouldPreserveManualHeight(180, TAILOR_TEXTAREA_MIN_HEIGHT_PX)).toBe(
      false,
    );
  });
});
