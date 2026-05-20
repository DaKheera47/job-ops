import { describe, expect, it } from "vitest";
import {
  CHANGELOG,
  formatChangelogMessage,
  getChangelogSince,
  getLatestChangelogVersion,
  type ChangelogEntry,
} from "./changelog";

/**
 * The changelog is the primary user-visible "what's new" surface on the
 * Telegram bot.  Two regressions we want this test to catch:
 *
 *   1. Cursor logic — if `getChangelogSince(lastSent)` returns an empty or
 *      misordered array we either spam the user with already-seen versions
 *      or silently swallow the latest release.
 *   2. Raw HTML / bad escaping — Telegram parses messages as HTML and
 *      will reject the whole message if it sees an unbalanced tag.  Any
 *      future agent who pastes "<3" or "&" into a description must not
 *      crash the broadcast.
 *
 * The CHANGELOG-monotonicity guard pins the array shape the way
 * step-ordering.test.ts pins the orchestrator: a static, contract-level
 * check that catches anyone who tries to insert an older version in the
 * wrong place.
 */

function parseSemver(version: string): [number, number, number] {
  const m = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!m) throw new Error(`Invalid semver: ${version}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a: string, b: string): number {
  const [a1, a2, a3] = parseSemver(a);
  const [b1, b2, b3] = parseSemver(b);
  if (a1 !== b1) return a1 - b1;
  if (a2 !== b2) return a2 - b2;
  return a3 - b3;
}

describe("CHANGELOG array invariants", () => {
  it("is non-empty", () => {
    expect(CHANGELOG.length).toBeGreaterThan(0);
  });

  it("has unique versions", () => {
    const versions = CHANGELOG.map((e) => e.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("is ordered newest-first by semver (strictly decreasing)", () => {
    for (let i = 1; i < CHANGELOG.length; i++) {
      const newer = CHANGELOG[i - 1].version;
      const older = CHANGELOG[i].version;
      expect(
        compareSemver(newer, older),
        `Changelog entries must be newest-first. ${newer} should be > ${older} but compareSemver returned <= 0.`,
      ).toBeGreaterThan(0);
    }
  });

  it("uses ISO YYYY-MM-DD dates", () => {
    for (const entry of CHANGELOG) {
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(Date.parse(entry.date))).toBe(false);
    }
  });

  it("has at least one item per entry, each with title + description", () => {
    for (const entry of CHANGELOG) {
      expect(entry.items.length).toBeGreaterThan(0);
      for (const item of entry.items) {
        expect(item.title.length).toBeGreaterThan(0);
        expect(item.description.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("getLatestChangelogVersion", () => {
  it("returns the first entry's version", () => {
    expect(getLatestChangelogVersion()).toBe(CHANGELOG[0].version);
  });
});

describe("getChangelogSince", () => {
  it("returns the entire array for a null cursor (first-time user)", () => {
    const result = getChangelogSince(null);
    expect(result).toHaveLength(CHANGELOG.length);
  });

  it("returns the entire array for an unknown cursor (defensive)", () => {
    const result = getChangelogSince("0.0.0-totally-bogus");
    expect(result).toHaveLength(CHANGELOG.length);
  });

  it("returns only strictly-newer entries for a known cursor", () => {
    // Pick the SECOND entry as the cursor → only the FIRST (newest) should remain.
    const cursor = CHANGELOG[1].version;
    const result = getChangelogSince(cursor);
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe(CHANGELOG[0].version);
  });

  it("returns an empty array when the cursor matches the latest version", () => {
    const result = getChangelogSince(CHANGELOG[0].version);
    expect(result).toHaveLength(0);
  });
});

describe("formatChangelogMessage", () => {
  it("returns an empty string for no entries", () => {
    expect(formatChangelogMessage([])).toBe("");
  });

  it("includes version, title, description, and tip for a single entry", () => {
    const msg = formatChangelogMessage([
      {
        version: "9.9.9",
        date: "2026-01-01",
        items: [
          {
            title: "✨ Sparkling feature",
            description: "Now everything is great.",
            tip: "Press the button.",
          },
        ],
      },
    ]);
    expect(msg).toContain("v9.9.9");
    expect(msg).toContain("Sparkling feature");
    expect(msg).toContain("Now everything is great.");
    expect(msg).toContain("Press the button.");
  });

  it("renders without a tip when the item omits it", () => {
    const msg = formatChangelogMessage([
      {
        version: "1.0.0",
        date: "2026-01-01",
        items: [
          {
            title: "Title",
            description: "Description.",
          },
        ],
      },
    ]);
    expect(msg).toContain("Title");
    expect(msg).toContain("Description.");
    // No raw "undefined" leaks.
    expect(msg).not.toContain("undefined");
  });

  it("escapes HTML special characters to avoid breaking Telegram's parser", () => {
    const malicious: ChangelogEntry = {
      version: "1.0.0",
      date: "2026-01-01",
      items: [
        {
          title: "<script>alert('xss')</script>",
          description: "Use <code> & </code> blocks",
          tip: "1 < 2 && 2 > 1",
        },
      ],
    };
    const msg = formatChangelogMessage([malicious]);
    // None of the raw HTML special characters should appear unescaped.
    expect(msg).not.toContain("<script>");
    expect(msg).not.toContain("<code>");
    expect(msg).toContain("&lt;script&gt;");
    expect(msg).toContain("&lt;code&gt;");
    expect(msg).toContain("&amp;");
  });

  it("uses the FIRST entry's version in the header (newest-first contract)", () => {
    const msg = formatChangelogMessage([
      {
        version: "2.0.0",
        date: "2026-02-01",
        items: [{ title: "Newer", description: "x" }],
      },
      {
        version: "1.0.0",
        date: "2026-01-01",
        items: [{ title: "Older", description: "y" }],
      },
    ]);
    // The header line is the very first line of the message.
    const firstLine = msg.split("\n")[0];
    expect(firstLine).toContain("v2.0.0");
    expect(firstLine).not.toContain("v1.0.0");
    // Both items still rendered in the body.
    expect(msg).toContain("Newer");
    expect(msg).toContain("Older");
  });
});
