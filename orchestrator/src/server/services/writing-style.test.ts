import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn(),
}));

import { getSetting } from "@server/repositories/settings";
import {
  getWritingStyle,
  stripLanguageDirectivesFromConstraints,
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
    });
  });

  it("strips language directives from constraints while keeping other guidance", () => {
    expect(
      stripLanguageDirectivesFromConstraints(
        "Always respond in French. Keep it under 90 words. Output language: German.",
      ),
    ).toBe("Keep it under 90 words");
  });
});
