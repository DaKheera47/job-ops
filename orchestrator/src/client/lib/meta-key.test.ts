import { describe, expect, it } from "vitest";
import {
  getMetaKeyLabel,
  getMetaShortcutLabel,
  isMetaKeyPressed,
} from "./meta-key";

describe("meta-key helper", () => {
  it("returns command symbol for apple platforms", () => {
    expect(
      getMetaKeyLabel({
        platform: "MacIntel",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)",
      }),
    ).toBe("⌘");
  });

  it("returns ctrl label for non-apple platforms", () => {
    expect(
      getMetaKeyLabel({
        platform: "Win32",
        userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      }),
    ).toBe("Ctrl");
  });

  it("formats shortcut labels by platform", () => {
    expect(getMetaShortcutLabel("k", { platform: "MacIntel" })).toBe("⌘K");
    expect(getMetaShortcutLabel("k", { platform: "Linux x86_64" })).toBe(
      "Ctrl+K",
    );
  });

  it("detects pressed meta/ctrl modifier", () => {
    expect(isMetaKeyPressed({ metaKey: true, ctrlKey: false })).toBe(true);
    expect(isMetaKeyPressed({ metaKey: false, ctrlKey: true })).toBe(true);
    expect(isMetaKeyPressed({ metaKey: false, ctrlKey: false })).toBe(false);
  });
});
