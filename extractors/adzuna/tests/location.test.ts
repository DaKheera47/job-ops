import { shouldApplyStrictCityFilter } from "@shared/search-cities.js";
import { describe, expect, it } from "vitest";

describe("adzuna location query strictness", () => {
  it("enables strict filtering when city differs from country", () => {
    expect(shouldApplyStrictCityFilter("Leeds", "united kingdom")).toBe(true);
  });

  it("disables strict filtering when location is country-level", () => {
    expect(shouldApplyStrictCityFilter("UK", "united kingdom")).toBe(false);
    expect(shouldApplyStrictCityFilter("United States", "us")).toBe(false);
  });
});
