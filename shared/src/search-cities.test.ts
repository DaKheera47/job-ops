import { describe, expect, it } from "vitest";
import {
  matchesRequestedCity,
  matchesRequestedCountry,
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

  it("matches requested countries using canonical names and common aliases", () => {
    expect(matchesRequestedCountry("Zagreb, Croatia", "croatia")).toBe(true);
    expect(
      matchesRequestedCountry("Leeds, England, UK", "united kingdom"),
    ).toBe(true);
    expect(
      matchesRequestedCountry(
        "Austin, Texas, United States of America",
        "united states",
      ),
    ).toBe(true);
    expect(matchesRequestedCountry("Bengaluru, India", "croatia")).toBe(false);
    expect(matchesRequestedCountry(undefined, "croatia")).toBe(false);
  });

  it("matches ISO-2 codes and localized country names", () => {
    expect(
      matchesRequestedCountry("Amsterdam Zuid, NH, NL", "netherlands"),
    ).toBe(true);
    expect(matchesRequestedCountry("Berlin, DE", "germany")).toBe(false);
    expect(matchesRequestedCountry("Amsterdam, Netherlands", "NL")).toBe(true);
    expect(matchesRequestedCountry("Berlin, BE, DE", "germany")).toBe(true);
    expect(matchesRequestedCountry("Amsterdam, Nederland", "netherlands")).toBe(
      true,
    );
    expect(matchesRequestedCountry("Berlin, Deutschland", "germany")).toBe(
      true,
    );
    expect(matchesRequestedCountry("Madrid, España", "spain")).toBe(true);
    expect(matchesRequestedCountry("İstanbul, Türkiye", "turkey")).toBe(true);
  });

  it("does not confuse country codes with subdivision abbreviations", () => {
    expect(matchesRequestedCountry("San Francisco, CA", "canada")).toBe(false);
    expect(matchesRequestedCountry("San Francisco, CA, US", "canada")).toBe(
      false,
    );
    expect(matchesRequestedCountry("Indianapolis, IN", "india")).toBe(false);
    expect(matchesRequestedCountry("IN", "india")).toBe(true);
  });
});
