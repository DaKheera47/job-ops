import { describe, expect, it } from "vitest";

import { termMatchesHaystack } from "./term-match";

describe("termMatchesHaystack", () => {
  it("matches the whole phrase verbatim", () => {
    expect(
      termMatchesHaystack(
        "Senior Program Manager — Open Source Office",
        "senior program manager",
      ),
    ).toBe(true);
  });

  it("matches when filler tokens (senior/lead/…) are missing from haystack", () => {
    expect(
      termMatchesHaystack("Program Manager II, Security", "Senior Program Manager"),
    ).toBe(true);
    expect(
      termMatchesHaystack("Lead Program Manager", "Senior Program Manager"),
    ).toBe(true);
    expect(termMatchesHaystack("Program Manager", "Staff Program Manager")).toBe(
      true,
    );
  });

  it("rejects when content tokens are missing", () => {
    expect(
      termMatchesHaystack(
        "Senior Software Engineer",
        "Senior Program Manager",
      ),
    ).toBe(false);
    expect(
      termMatchesHaystack(
        "Senior Marketing Manager",
        "Senior Program Manager",
      ),
    ).toBe(false);
  });

  it("works with niche multi-word phrases", () => {
    expect(
      termMatchesHaystack(
        "Functional Safety Manager — ISO 26262",
        "Functional Safety Manager",
      ),
    ).toBe(true);
    expect(
      termMatchesHaystack(
        "ISO 26262 Compliance Engineer",
        "Functional Safety Manager",
      ),
    ).toBe(false);
  });

  it("treats empty search term as match (allows pass-through)", () => {
    expect(termMatchesHaystack("anything here", "")).toBe(true);
  });

  it("respects custom filler tokens", () => {
    expect(
      termMatchesHaystack("Foo Bar", "Custom Foo Bar", {
        fillerTokens: new Set(["custom"]),
      }),
    ).toBe(true);
  });

  it("disables filler dropping when requested", () => {
    expect(
      termMatchesHaystack("Program Manager", "Senior Program Manager", {
        dropFillerTokens: false,
      }),
    ).toBe(false);
  });
});
