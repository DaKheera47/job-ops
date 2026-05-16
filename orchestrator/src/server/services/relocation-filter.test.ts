import { describe, expect, it } from "vitest";

import { requiresRelocation } from "./relocation-filter";

describe("requiresRelocation", () => {
  it("keeps Munich and its suburbs regardless of remote flag", () => {
    expect(requiresRelocation({ location: "Munich, Germany" })).toBe(false);
    expect(requiresRelocation({ location: "München, BY, DE" })).toBe(false);
    expect(requiresRelocation({ location: "Garching bei München" })).toBe(false);
    expect(
      requiresRelocation({ location: "Ottobrunn", isRemote: false }),
    ).toBe(false);
  });

  it("keeps any location containing an explicit remote marker", () => {
    expect(requiresRelocation({ location: "Remote" })).toBe(false);
    expect(requiresRelocation({ location: "Anywhere in the world" })).toBe(
      false,
    );
    expect(
      requiresRelocation({ location: "Remote, San Francisco" }),
    ).toBe(false);
  });

  it("keeps country-only locations only when the role is flagged remote", () => {
    expect(
      requiresRelocation({ location: "United States", isRemote: true }),
    ).toBe(false);
    expect(
      requiresRelocation({ location: "Germany", isRemote: true }),
    ).toBe(false);
    expect(
      requiresRelocation({ location: "DE", isRemote: true }),
    ).toBe(false);

    // The key new behaviour: country-only without an explicit remote flag is
    // now treated as relocation (previously these slipped through).
    expect(
      requiresRelocation({ location: "United States", isRemote: false }),
    ).toBe(true);
    expect(
      requiresRelocation({ location: "Canada", isRemote: null }),
    ).toBe(true);
    expect(requiresRelocation({ location: "United Kingdom" })).toBe(true);
  });

  it("flags city-level non-Munich locations as relocation", () => {
    expect(
      requiresRelocation({ location: "Berlin, Germany", isRemote: false }),
    ).toBe(true);
    // Even with isRemote=true: LinkedIn frequently sets isRemote for hybrid
    // city roles, so the location string remains authoritative.
    expect(
      requiresRelocation({
        location: "San Francisco, CA, United States",
        isRemote: true,
      }),
    ).toBe(true);
    expect(
      requiresRelocation({ location: "Dubai, United Arab Emirates" }),
    ).toBe(true);
  });

  it("treats empty location as unknown (no filter)", () => {
    expect(requiresRelocation({ location: null })).toBe(false);
    expect(requiresRelocation({ location: "" })).toBe(false);
    expect(requiresRelocation({})).toBe(false);
  });
});
