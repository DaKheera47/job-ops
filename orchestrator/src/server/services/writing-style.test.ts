import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn(),
}));

import { getSetting } from "@server/repositories/settings";
import {
  getWritingStyle,
  stripKeywordLimitFromConstraints,
  stripLanguageDirectivesFromConstraints,
  stripWordLimitFromConstraints,
} from "./writing-style";

describe("getWritingStyle", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    delete process.env.CHAT_STYLE_TONE;
    delete process.env.CHAT_STYLE_FORMALITY;
    delete process.env.CHAT_STYLE_CONSTRAINTS;
    delete process.env.CHAT_STYLE_DO_NOT_USE;
    delete process.env.CHAT_STYLE_LANGUAGE_MODE;
    delete process.env.CHAT_STYLE_MANUAL_LANGUAGE;
  });

  it("uses defaults when no overrides are stored", async () => {
    vi.mocked(getSetting).mockResolvedValue(null);

    await expect(getWritingStyle()).resolves.toEqual({
      tone: "professional",
      formality: "medium",
      constraints: "",
      doNotUse: "",
      languageMode: "manual",
      manualLanguage: "english",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
  });

  it("uses stored overrides when present", async () => {
    vi.mocked(getSetting).mockImplementation(async (key) => {
      switch (key) {
        case "chatStyleTone":
          return "friendly";
        case "chatStyleFormality":
          return "low";
        case "chatStyleConstraints":
          return "Keep it short";
        case "chatStyleDoNotUse":
          return "synergy";
        case "chatStyleLanguageMode":
          return "match-resume";
        case "chatStyleManualLanguage":
          return "german";
        default:
          return null;
      }
    });

    await expect(getWritingStyle()).resolves.toEqual({
      tone: "friendly",
      formality: "low",
      constraints: "Keep it short",
      doNotUse: "synergy",
      languageMode: "match-resume",
      manualLanguage: "german",
      summaryMaxWords: null,
      maxKeywordsPerSkill: null,
    });
  });

  it("parses numeric string '35' as summaryMaxWords=35", async () => {
    vi.mocked(getSetting).mockImplementation(async (key) => {
      if (key === "chatStyleSummaryMaxWords") return "35";
      return null;
    });

    const style = await getWritingStyle();
    expect(style.summaryMaxWords).toBe(35);
  });

  it("falls back to null for non-numeric summaryMaxWords", async () => {
    vi.mocked(getSetting).mockImplementation(async (key) => {
      if (key === "chatStyleSummaryMaxWords") return "abc";
      return null;
    });

    const style = await getWritingStyle();
    expect(style.summaryMaxWords).toBeNull();
  });

  it("guards zero summaryMaxWords to null", async () => {
    vi.mocked(getSetting).mockImplementation(async (key) => {
      if (key === "chatStyleSummaryMaxWords") return "0";
      return null;
    });

    const style = await getWritingStyle();
    expect(style.summaryMaxWords).toBeNull();
  });

  it("strips language directives from constraints while keeping other guidance", () => {
    expect(
      stripLanguageDirectivesFromConstraints(
        "Always respond in French. Keep it under 90 words. Output language: German.",
      ),
    ).toBe("Keep it under 90 words");
  });
});

describe("stripWordLimitFromConstraints", () => {
  it("strips 'keep summary under N words' patterns", () => {
    expect(
      stripWordLimitFromConstraints(
        "Keep summary under 100 words. Be concise.",
      ),
    ).toBe("Be concise");
  });

  it("strips 'max N words' patterns", () => {
    expect(
      stripWordLimitFromConstraints("Use action verbs. Max 80 words."),
    ).toBe("Use action verbs");
  });

  it("strips 'N words max' patterns", () => {
    expect(
      stripWordLimitFromConstraints("50 words max. Focus on impact."),
    ).toBe("Focus on impact");
  });

  it("strips 'no more than N words' patterns", () => {
    expect(
      stripWordLimitFromConstraints("No more than 60 words in the summary."),
    ).toBe("");
  });

  it("returns empty string for empty input", () => {
    expect(stripWordLimitFromConstraints("")).toBe("");
  });

  it("preserves unrelated constraints", () => {
    expect(
      stripWordLimitFromConstraints("Be professional. Use strong verbs."),
    ).toBe("Be professional. Use strong verbs");
  });
});

describe("stripKeywordLimitFromConstraints", () => {
  it("strips 'max N keywords per category' patterns", () => {
    expect(
      stripKeywordLimitFromConstraints(
        "Max 5 keywords per category. Be specific.",
      ),
    ).toBe("Be specific");
  });

  it("strips 'limit keywords to N' patterns", () => {
    expect(
      stripKeywordLimitFromConstraints("Limit keywords to 8. Use JD terms."),
    ).toBe("Use JD terms");
  });

  it("strips 'N keywords max' patterns", () => {
    expect(
      stripKeywordLimitFromConstraints(
        "10 keywords max. Prioritize hard skills.",
      ),
    ).toBe("Prioritize hard skills");
  });

  it("returns empty string for empty input", () => {
    expect(stripKeywordLimitFromConstraints("")).toBe("");
  });

  it("preserves unrelated constraints", () => {
    expect(
      stripKeywordLimitFromConstraints("Be professional. Use strong verbs."),
    ).toBe("Be professional. Use strong verbs");
  });
});
