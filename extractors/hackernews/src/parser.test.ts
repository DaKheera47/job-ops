import { describe, expect, it } from "vitest";

import { parseHnComment, stripHnHtml } from "./parser";

describe("stripHnHtml", () => {
  it("strips paragraph tags, anchors and entities", () => {
    expect(
      stripHnHtml(
        "<p>Anthropic | San Francisco / Remote (US, EU) | Software Engineer</p><p>Apply at <a href=\"mailto:jobs@anthropic.com\">jobs@anthropic.com</a></p>",
      ),
    ).toBe(
      "Anthropic | San Francisco / Remote (US, EU) | Software Engineer\n\nApply at jobs@anthropic.com",
    );
  });

  it("decodes &amp; / &#x27; / &quot;", () => {
    expect(stripHnHtml("Foo &amp; Bar &#x27;hello&#x27; &quot;world&quot;")).toBe(
      "Foo & Bar 'hello' \"world\"",
    );
  });

  it("decodes &#x2F; into a slash so URLs survive parsing", () => {
    expect(stripHnHtml("https:&#x2F;&#x2F;example.com&#x2F;path")).toBe(
      "https://example.com/path",
    );
  });
});

describe("parseHnComment", () => {
  it("parses a canonical pipe-separated REMOTE listing", () => {
    const html =
      "<p>Anthropic | San Francisco / Remote (US, EU) | Senior Program Manager — Security | full-time | comp $$$ | jobs@anthropic.com</p><p>We're hiring …</p>";
    const result = parseHnComment(html);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.company).toBe("Anthropic");
    expect(result.title.toLowerCase()).toContain("program manager");
    expect(result.isRemote).toBe(true);
    expect(result.location.toLowerCase()).toContain("remote");
  });

  it("parses with em-dash delimiters", () => {
    const html =
      "<p>GitLab — Remote (Worldwide) — Engineering Manager, Security — full-time</p>";
    const result = parseHnComment(html);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.company).toBe("GitLab");
    expect(result.title.toLowerCase()).toContain("engineering manager");
    expect(result.isRemote).toBe(true);
  });

  it("rejects onsite-only listings", () => {
    const html =
      "<p>Stripe | San Francisco, CA (onsite only) | Staff Engineer</p>";
    const result = parseHnComment(html);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.isRemote).toBe(false);
  });

  it("rejects 'SEEKING FREELANCER' posts (those are gig requests)", () => {
    const html =
      "<p>SEEKING FREELANCER — Founding AI Engineer (Solo dev for hire)</p>";
    expect(parseHnComment(html)).toBeNull();
  });

  it("rejects intern-only listings", () => {
    const html =
      "<p>Big Corp | NYC / Remote | Software Engineer Intern (Summer Internship Program)</p>";
    expect(parseHnComment(html)).toBeNull();
  });

  it("returns null for free-form prose without pipe delimiter", () => {
    const html =
      "<p>I'm a freelance developer offering my services in TypeScript and React. I'm based in remote location.</p>";
    expect(parseHnComment(html)).toBeNull();
  });

  it("returns null when no role-shaped piece is present", () => {
    const html = "<p>SomeCo | Berlin | Full-time | Apply via email</p>";
    expect(parseHnComment(html)).toBeNull();
  });

  it("trims excessively long company names as garbage", () => {
    const longCompany = "x".repeat(200);
    const html = `<p>${longCompany} | Remote | Software Engineer</p>`;
    expect(parseHnComment(html)).toBeNull();
  });

  it("handles 'Remote (US only)' as remote", () => {
    const html =
      "<p>Vercel | Remote (US only) | Senior Software Engineer — Frontend</p>";
    const result = parseHnComment(html);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.isRemote).toBe(true);
  });

  it("captures description after the header", () => {
    const html =
      "<p>Acme | Remote | DevRel Program Manager</p><p>We build developer tools used by 100k+ orgs.</p>";
    const result = parseHnComment(html);
    expect(result).not.toBeNull();
    if (!result) return;
    expect(result.description).toContain("developer tools");
  });
});
