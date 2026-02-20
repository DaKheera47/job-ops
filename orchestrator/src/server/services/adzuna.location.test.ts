import { describe, expect, it } from "vitest";
import {
  matchesRequestedLocation,
  shouldApplyStrictLocationFilter,
} from "./adzuna";

describe("adzuna strict location filtering", () => {
  it("enables strict filtering when city differs from country", () => {
    expect(shouldApplyStrictLocationFilter("Leeds", "united kingdom")).toBe(
      true,
    );
  });

  it("disables strict filtering when location is country-level", () => {
    expect(shouldApplyStrictLocationFilter("UK", "united kingdom")).toBe(false);
    expect(shouldApplyStrictLocationFilter("United States", "us")).toBe(false);
  });

  it("matches requested location by case-insensitive contains", () => {
    expect(matchesRequestedLocation("Leeds, England, UK", "leeds")).toBe(true);
    expect(matchesRequestedLocation("Halifax, England, UK", "leeds")).toBe(
      false,
    );
    expect(matchesRequestedLocation(undefined, "leeds")).toBe(false);
  });
});
