import type { ResumeProfile } from "@shared/types";
import { describe, expect, it } from "vitest";
import {
  detectProfileLanguage,
  resolveWritingOutputLanguage,
} from "./output-language";

describe("resolveWritingOutputLanguage", () => {
  it("uses the manual language when manual mode is selected", () => {
    const result = resolveWritingOutputLanguage({
      style: {
        languageMode: "manual",
        manualLanguage: "spanish",
      },
      profile: {},
    });

    expect(result).toEqual({
      language: "spanish",
      source: "manual",
    });
  });

  it("detects supported non-english resume language from profile text", () => {
    const profile: ResumeProfile = {
      basics: {
        summary:
          "Ich entwickle skalierbare Plattformen und arbeite eng mit Produktteams und der Entwicklung zusammen.",
      },
      sections: {
        summary: {
          content:
            "Erfahrung mit verteilten Systemen, APIs und verantwortlicher Lieferung für das Team.",
        },
      },
    };

    expect(detectProfileLanguage(profile)).toBe("german");
    expect(
      resolveWritingOutputLanguage({
        style: {
          languageMode: "match-resume",
          manualLanguage: "english",
        },
        profile,
      }),
    ).toEqual({
      language: "german",
      source: "detected",
    });
  });

  it("falls back to english when resume language detection is weak", () => {
    const result = resolveWritingOutputLanguage({
      style: {
        languageMode: "match-resume",
        manualLanguage: "french",
      },
      profile: {
        basics: {
          headline: "Senior Engineer",
        },
      },
    });

    expect(result).toEqual({
      language: "english",
      source: "fallback",
    });
  });
});
