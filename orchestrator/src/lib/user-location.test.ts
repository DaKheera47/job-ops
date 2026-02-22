import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectUserCountryKey, getDetectedCountryKey } from "./user-location";

describe("user-location", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("detects a supported country from browser locale region", () => {
    expect(
      detectUserCountryKey({
        languages: ["en-US", "en"],
        language: "en",
        timeZone: "Europe/London",
      }),
    ).toBe("united states");
  });

  it("falls back to timezone when locale has no region", () => {
    expect(
      detectUserCountryKey({
        languages: ["en"],
        language: "en",
        timeZone: "America/New_York",
      }),
    ).toBe("united states");
  });

  it("returns cached country without re-detecting", () => {
    localStorage.setItem(
      "jobops.user-country-cache.v1",
      JSON.stringify({
        country: "united kingdom",
        detectedAt: Date.now(),
      }),
    );

    const result = getDetectedCountryKey();

    expect(result).toBe("united kingdom");
  });

  it("caches detected country from browser signals", () => {
    Object.defineProperty(window.navigator, "languages", {
      configurable: true,
      value: ["en-US"],
    });
    Object.defineProperty(window.navigator, "language", {
      configurable: true,
      value: "en-US",
    });
    const result = getDetectedCountryKey();
    const cached = localStorage.getItem("jobops.user-country-cache.v1");

    expect(result).toBe("united states");
    expect(cached).toContain("united states");
  });
});
