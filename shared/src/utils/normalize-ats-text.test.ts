import { describe, expect, it } from "vitest";
import { normalizeTextForATS } from "../utils/normalize-ats-text";

describe("normalizeTextForATS", () => {
  it("replaces em-dash and en-dash with hyphen", () => {
    expect(normalizeTextForATS("full\u2013stack \u2014 developer")).toBe(
      "full-stack - developer",
    );
  });

  it("replaces other Unicode dashes with hyphen", () => {
    expect(normalizeTextForATS("dash\u2010here\u2011and\u2012there")).toBe(
      "dash-here-and-there",
    );
  });

  it("replaces bullet with hyphen", () => {
    expect(normalizeTextForATS("\u2022 item one")).toBe("- item one");
  });

  it("replaces smart double quotes with straight quotes", () => {
    expect(normalizeTextForATS("\u201Chello\u201D")).toBe('"hello"');
    expect(normalizeTextForATS("\u201Ehello\u201F")).toBe('"hello"');
  });

  it("replaces smart single quotes with apostrophe", () => {
    expect(normalizeTextForATS("\u2018it\u2019s")).toBe("'it's");
    expect(normalizeTextForATS("\u201Atest\u201B")).toBe("'test'");
  });

  it("replaces ellipsis with three dots", () => {
    expect(normalizeTextForATS("wait\u2026")).toBe("wait...");
  });

  it("removes zero-width characters", () => {
    expect(
      normalizeTextForATS("a\u200Bb\u200Cc\u200Dd\u2060e\uFEFFf"),
    ).toBe("abcdef");
  });

  it("replaces non-breaking space with regular space", () => {
    expect(normalizeTextForATS("hello\u00A0world")).toBe("hello world");
  });

  it("collapses multiple whitespace to single space", () => {
    expect(normalizeTextForATS("hello   \n\t  world")).toBe("hello world");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeTextForATS("  hello world  ")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(normalizeTextForATS("")).toBe("");
  });

  it("leaves clean ASCII text unchanged", () => {
    const text = "Senior Software Engineer - 5+ years React, Node.js";
    expect(normalizeTextForATS(text)).toBe(text);
  });

  it("handles combined replacements", () => {
    expect(
      normalizeTextForATS(
        "\u201CSenior\u201D full\u2013stack dev \u2022 React\u2026",
      ),
    ).toBe('"Senior" full-stack dev - React...');
  });
});
