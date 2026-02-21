import { describe, expect, it } from "vitest";
import {
  matchesRequestedCity,
  parseSearchCitiesSetting,
  resolveSearchCities,
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

  it("resolves search cities from list/single/env/fallback", () => {
    expect(
      resolveSearchCities({
        list: [" Leeds ", "London", "leeds"],
      }),
    ).toEqual(["Leeds", "London"]);

    expect(resolveSearchCities({ single: "Leeds|London" })).toEqual([
      "Leeds",
      "London",
    ]);
    expect(resolveSearchCities({ env: "Leeds\nLondon" })).toEqual([
      "Leeds",
      "London",
    ]);
    expect(resolveSearchCities({ fallback: "UK" })).toEqual(["UK"]);
  });

  it("falls back when single/env values parse to empty", () => {
    expect(resolveSearchCities({ single: "", fallback: "UK" })).toEqual(["UK"]);
    expect(resolveSearchCities({ single: "||", fallback: "UK" })).toEqual([
      "UK",
    ]);
    expect(resolveSearchCities({ env: "   ", fallback: "UK" })).toEqual(["UK"]);
  });

  it("returns empty array when all resolve options are empty", () => {
    expect(
      resolveSearchCities({
        list: [],
        single: "",
        env: "",
        fallback: "",
      }),
    ).toEqual([]);
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
