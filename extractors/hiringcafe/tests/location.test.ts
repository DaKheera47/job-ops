import { describe, expect, it } from "vitest";
import { shouldApplyStrictLocationFilter } from "../src/run";

describe("hiringcafe location query strictness", () => {
  it("enables strict filtering when city differs from country", () => {
    expect(shouldApplyStrictLocationFilter("Leeds", "united kingdom")).toBe(
      true,
    );
  });

  it("disables strict filtering when location is country-level", () => {
    expect(shouldApplyStrictLocationFilter("UK", "united kingdom")).toBe(false);
    expect(shouldApplyStrictLocationFilter("United States", "us")).toBe(false);
  });
});
