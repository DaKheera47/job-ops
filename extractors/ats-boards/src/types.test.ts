import { describe, expect, it } from "vitest";

import { detectIsRemoteFromAts } from "./types";

describe("detectIsRemoteFromAts", () => {
  it("detects 'Remote' as the location", () => {
    expect(detectIsRemoteFromAts("Remote")).toBe(true);
    expect(detectIsRemoteFromAts("Remote (US)")).toBe(true);
    expect(detectIsRemoteFromAts("Remote, EMEA")).toBe(true);
    expect(detectIsRemoteFromAts("Anywhere")).toBe(true);
    expect(detectIsRemoteFromAts("Fully Remote")).toBe(true);
    expect(detectIsRemoteFromAts("100% Remote")).toBe(true);
    expect(detectIsRemoteFromAts("Worldwide")).toBe(true);
    expect(detectIsRemoteFromAts("Distributed")).toBe(true);
  });

  it("rejects city-only locations", () => {
    expect(detectIsRemoteFromAts("San Francisco, CA")).toBe(false);
    expect(detectIsRemoteFromAts("Berlin, Germany")).toBe(false);
    expect(detectIsRemoteFromAts("London, UK")).toBe(false);
    expect(detectIsRemoteFromAts("Munich")).toBe(false);
  });

  it("treats 'Not specified' / empty as needing description fallback", () => {
    expect(
      detectIsRemoteFromAts(
        "Not specified",
        "We're a fully remote-first team based across 30 countries.",
      ),
    ).toBe(true);

    expect(
      detectIsRemoteFromAts(
        "",
        "We meet in our San Francisco office five days a week.",
      ),
    ).toBe(false);
  });

  it("does NOT consult description when location is informative", () => {
    // Location says New York → trust it even if the description talks about
    // remote-friendly perks elsewhere (would be a false positive otherwise).
    expect(
      detectIsRemoteFromAts(
        "New York, NY",
        "We support remote work for tenured employees.",
      ),
    ).toBe(false);
  });

  it("handles null/undefined gracefully", () => {
    expect(detectIsRemoteFromAts(null)).toBe(false);
    expect(detectIsRemoteFromAts(undefined)).toBe(false);
    expect(detectIsRemoteFromAts(null, null)).toBe(false);
  });

  it("matches case-insensitively and across punctuation", () => {
    expect(detectIsRemoteFromAts("REMOTE — Europe")).toBe(true);
    expect(detectIsRemoteFromAts("Home office")).toBe(true);
  });
});
