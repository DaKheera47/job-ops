import { describe, expect, it } from "vitest";
import {
  matchesRequestedCity,
  parseSearchCitiesSetting,
  serializeSearchCitiesSetting,
  shouldApplyStrictCityFilter,
} from "./search-cities";

describe("search-cities", () => {
  it("parses and deduplicates search cities", () => {
    expect(parseSearchCitiesSetting("Leeds|london|Leeds")).toEqual([
      "Leeds",
      "london",
    ]);
    expect(parseSearchCitiesSetting("Leeds\nLondon\nleeds")).toEqual([
      "Leeds",
      "London",
    ]);
    expect(parseSearchCitiesSetting("")).toEqual([]);
  });

  it("serializes search cities", () => {
    expect(serializeSearchCitiesSetting(["Leeds", "London"])).toBe(
      "Leeds|London",
    );
    expect(serializeSearchCitiesSetting([])).toBeNull();
  });

  it("applies strict filter only when city differs from country", () => {
    expect(shouldApplyStrictCityFilter("Leeds", "united kingdom")).toBe(true);
    expect(shouldApplyStrictCityFilter("UK", "united kingdom")).toBe(false);
    expect(shouldApplyStrictCityFilter("usa", "united states")).toBe(false);
  });

  it("matches by whole location tokens and avoids substring false positives", () => {
    expect(matchesRequestedCity("Leeds, England, UK", "Leeds")).toBe(true);
    expect(matchesRequestedCity("Manchester, England, UK", "Chester")).toBe(
      false,
    );
    expect(
      matchesRequestedCity("New York, NY, United States", "new york"),
    ).toBe(true);
  });
});
