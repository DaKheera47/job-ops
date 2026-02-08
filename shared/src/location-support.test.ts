import { describe, expect, it } from "vitest";
import {
  formatCountryLabel,
  getCompatibleSourcesForCountry,
  isSourceAllowedForCountry,
  isUkCountry,
  normalizeCountryKey,
  SUPPORTED_COUNTRY_KEYS,
} from "./location-support";

describe("location-support", () => {
  it("normalizes country aliases", () => {
    expect(normalizeCountryKey("UK")).toBe("united kingdom");
    expect(normalizeCountryKey("us")).toBe("united states");
    expect(normalizeCountryKey("usa")).toBe("united states");
    expect(normalizeCountryKey("czech republic")).toBe("czechia");
  });

  it("formats country labels", () => {
    expect(formatCountryLabel("united kingdom")).toBe("United Kingdom");
    expect(formatCountryLabel("usa/ca")).toBe("USA/CA");
    expect(formatCountryLabel("south korea")).toBe("South Korea");
  });

  it("keeps supported country keys unique and canonical", () => {
    expect(SUPPORTED_COUNTRY_KEYS).toContain("united kingdom");
    expect(SUPPORTED_COUNTRY_KEYS).toContain("united states");
    expect(SUPPORTED_COUNTRY_KEYS).toContain("worldwide");
    expect(SUPPORTED_COUNTRY_KEYS).not.toContain("uk");
    expect(SUPPORTED_COUNTRY_KEYS).not.toContain("us");
  });

  it("treats only united kingdom as UK country", () => {
    expect(isUkCountry("united kingdom")).toBe(true);
    expect(isUkCountry("UK")).toBe(true);
    expect(isUkCountry("worldwide")).toBe(false);
    expect(isUkCountry("usa/ca")).toBe(false);
    expect(isUkCountry("united states")).toBe(false);
  });

  it("applies source compatibility rules by country", () => {
    expect(isSourceAllowedForCountry("gradcracker", "united kingdom")).toBe(
      true,
    );
    expect(isSourceAllowedForCountry("ukvisajobs", "uk")).toBe(true);
    expect(isSourceAllowedForCountry("gradcracker", "united states")).toBe(
      false,
    );
    expect(isSourceAllowedForCountry("ukvisajobs", "worldwide")).toBe(false);
    expect(isSourceAllowedForCountry("indeed", "united states")).toBe(true);
    expect(isSourceAllowedForCountry("linkedin", "worldwide")).toBe(true);
  });

  it("filters incompatible sources while preserving compatible order", () => {
    expect(
      getCompatibleSourcesForCountry(
        ["gradcracker", "indeed", "ukvisajobs", "linkedin"],
        "united states",
      ),
    ).toEqual(["indeed", "linkedin"]);
  });
});
