import { createAppSettings } from "@shared/testing/factories";
import type { ResumeProfile } from "@shared/types";
import { describe, expect, it } from "vitest";
import { resolveFilenameLanguage } from "./pdf-filename";

describe("resolveFilenameLanguage", () => {
  it("uses manual language settings", () => {
    expect(
      resolveFilenameLanguage({
        settings: createAppSettings({
          chatStyleLanguageMode: {
            value: "manual",
            default: "manual",
            override: null,
          },
          chatStyleManualLanguage: {
            value: "german",
            default: "english",
            override: null,
          },
        }),
        profile: null,
      }),
    ).toBe("german");
  });

  it("detects the profile language in match-resume mode", () => {
    const profile: ResumeProfile = {
      basics: {
        summary:
          "Ich entwickle Plattformen und arbeite mit der Entwicklung zusammen.",
      },
      sections: {
        summary: {
          content:
            "Erfahrung mit APIs und verantwortlicher Lieferung für das Team.",
        },
      },
    };

    expect(
      resolveFilenameLanguage({
        settings: createAppSettings({
          chatStyleLanguageMode: {
            value: "match-resume",
            default: "manual",
            override: null,
          },
        }),
        profile,
      }),
    ).toBe("german");
  });
});
