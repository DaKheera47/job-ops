import { describe, expect, it } from "vitest";
import { getDefaultPromptTemplate } from "./prompt-template-definitions";
import {
  getDefaultModelForProvider,
  settingsRegistry,
} from "./settings-registry";

describe("settingsRegistry helpers", () => {
  describe("searchCities defaults", () => {
    it("defaults to empty when no location env is configured", () => {
      const previousSearchCities = process.env.SEARCH_CITIES;
      const previousJobspyLocation = process.env.JOBSPY_LOCATION;

      delete process.env.SEARCH_CITIES;
      delete process.env.JOBSPY_LOCATION;

      try {
        expect(settingsRegistry.searchCities.default()).toBe("");
      } finally {
        if (previousSearchCities === undefined) {
          delete process.env.SEARCH_CITIES;
        } else {
          process.env.SEARCH_CITIES = previousSearchCities;
        }

        if (previousJobspyLocation === undefined) {
          delete process.env.JOBSPY_LOCATION;
        } else {
          process.env.JOBSPY_LOCATION = previousJobspyLocation;
        }
      }
    });

    it("uses explicit SEARCH_CITIES or legacy JOBSPY_LOCATION env values", () => {
      const previousSearchCities = process.env.SEARCH_CITIES;
      const previousJobspyLocation = process.env.JOBSPY_LOCATION;

      process.env.SEARCH_CITIES = "Leeds|London";
      process.env.JOBSPY_LOCATION = "Manchester";

      try {
        expect(settingsRegistry.searchCities.default()).toBe("Leeds|London");
        delete process.env.SEARCH_CITIES;
        expect(settingsRegistry.searchCities.default()).toBe("Manchester");
      } finally {
        if (previousSearchCities === undefined) {
          delete process.env.SEARCH_CITIES;
        } else {
          process.env.SEARCH_CITIES = previousSearchCities;
        }

        if (previousJobspyLocation === undefined) {
          delete process.env.JOBSPY_LOCATION;
        } else {
          process.env.JOBSPY_LOCATION = previousJobspyLocation;
        }
      }
    });
  });

  describe("string parsing (parseNonEmptyStringOrNull)", () => {
    it("returns null for undefined", () => {
      expect(settingsRegistry.model.parse(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(settingsRegistry.searchCities.parse("")).toBeNull();
    });

    it("returns the string for non-empty string", () => {
      expect(settingsRegistry.searchCities.parse("London")).toBe("London");
    });

    it("uses shared default prompt templates for prompt settings", () => {
      expect(settingsRegistry.ghostwriterSystemPromptTemplate.default()).toBe(
        getDefaultPromptTemplate("ghostwriterSystemPromptTemplate"),
      );
      expect(settingsRegistry.tailoringPromptTemplate.default()).toBe(
        getDefaultPromptTemplate("tailoringPromptTemplate"),
      );
      expect(settingsRegistry.scoringPromptTemplate.default()).toBe(
        getDefaultPromptTemplate("scoringPromptTemplate"),
      );
    });
  });

  describe("number parsing and clamping", () => {
    it("returns null for empty/invalid values", () => {
      expect(settingsRegistry.ukvisajobsMaxJobs.parse("")).toBeNull();
      expect(settingsRegistry.ukvisajobsMaxJobs.parse("abc")).toBeNull();
      expect(settingsRegistry.ukvisajobsMaxJobs.parse(undefined)).toBeNull();
    });

    it("parses valid numbers", () => {
      expect(settingsRegistry.ukvisajobsMaxJobs.parse("42")).toBe(42);
    });

    it("clamps backupHour to 0-23", () => {
      expect(settingsRegistry.backupHour.parse("25")).toBe(23);
      expect(settingsRegistry.backupHour.parse("-1")).toBe(0);
      expect(settingsRegistry.backupHour.parse("12")).toBe(12);
    });

    it("clamps backupMaxCount to 1-5", () => {
      expect(settingsRegistry.backupMaxCount.parse("10")).toBe(5);
      expect(settingsRegistry.backupMaxCount.parse("0")).toBe(1);
      expect(settingsRegistry.backupMaxCount.parse("3")).toBe(3);
    });

    it("clamps missingSalaryPenalty to 0-100", () => {
      expect(settingsRegistry.missingSalaryPenalty.parse("150")).toBe(100);
      expect(settingsRegistry.missingSalaryPenalty.parse("-10")).toBe(0);
      expect(settingsRegistry.missingSalaryPenalty.parse("50")).toBe(50);
    });
  });

  describe("boolean (bit-bool) parsing and serialization", () => {
    it("parses bit bools correctly", () => {
      expect(settingsRegistry.showSponsorInfo.parse("1")).toBe(true);
      expect(settingsRegistry.showSponsorInfo.parse("true")).toBe(true);
      expect(settingsRegistry.showSponsorInfo.parse("0")).toBe(false);
      expect(settingsRegistry.showSponsorInfo.parse("false")).toBe(false);
      expect(settingsRegistry.showSponsorInfo.parse("")).toBeNull();
      expect(settingsRegistry.showSponsorInfo.parse(undefined)).toBeNull();
      expect(settingsRegistry.renderMarkdownInJobDescriptions.parse("1")).toBe(
        true,
      );
      expect(settingsRegistry.renderMarkdownInJobDescriptions.parse("0")).toBe(
        false,
      );
    });

    it("serializes bit bools correctly", () => {
      expect(settingsRegistry.showSponsorInfo.serialize(true)).toBe("1");
      expect(settingsRegistry.showSponsorInfo.serialize(false)).toBe("0");
      expect(settingsRegistry.showSponsorInfo.serialize(null)).toBeNull();
      expect(settingsRegistry.showSponsorInfo.serialize(undefined)).toBeNull();
      expect(
        settingsRegistry.renderMarkdownInJobDescriptions.serialize(true),
      ).toBe("1");
      expect(
        settingsRegistry.renderMarkdownInJobDescriptions.serialize(false),
      ).toBe("0");
    });
  });

  describe("JSON array parsing", () => {
    it("parses valid JSON arrays", () => {
      expect(settingsRegistry.searchTerms.parse('["dev", "engineer"]')).toEqual(
        ["dev", "engineer"],
      );
    });

    it("returns null for invalid JSON or non-arrays", () => {
      expect(settingsRegistry.searchTerms.parse('{"not": "array"}')).toBeNull();
      expect(settingsRegistry.searchTerms.parse("invalid json")).toBeNull();
      expect(settingsRegistry.searchTerms.parse("")).toBeNull();
      expect(settingsRegistry.searchTerms.parse(undefined)).toBeNull();
    });

    it("serializes arrays back to JSON", () => {
      expect(settingsRegistry.searchTerms.serialize(["dev", "engineer"])).toBe(
        '["dev","engineer"]',
      );
      expect(settingsRegistry.searchTerms.serialize(null)).toBeNull();
    });

    it("parses valid workplace type arrays", () => {
      expect(
        settingsRegistry.workplaceTypes.parse('["remote","onsite"]'),
      ).toEqual(["remote", "onsite"]);
    });

    it("rejects invalid workplace type arrays", () => {
      expect(
        settingsRegistry.workplaceTypes.parse('["remote","satellite"]'),
      ).toBeNull();
      expect(settingsRegistry.workplaceTypes.parse("[]")).toBeNull();
    });
  });

  describe("Resume projects settings", () => {
    it("parses and serializes resume projects", () => {
      const obj = {
        maxProjects: 10,
        lockedProjectIds: ["1", "2"],
        aiSelectableProjectIds: ["3"],
      };
      const json = JSON.stringify(obj);

      expect(settingsRegistry.resumeProjects.parse(json)).toEqual(obj);
      expect(settingsRegistry.resumeProjects.parse("invalid")).toBeNull();

      expect(settingsRegistry.resumeProjects.serialize(obj)).toBe(json);
      expect(settingsRegistry.resumeProjects.serialize(null)).toBeNull();
    });
  });

  describe("RxResume settings", () => {
    it("parses rxresumeMode enum values and rejects invalid values", () => {
      expect(settingsRegistry.rxresumeMode.parse("v4")).toBe("v4");
      expect(settingsRegistry.rxresumeMode.parse("v5")).toBe("v5");
      expect(settingsRegistry.rxresumeMode.parse("")).toBeNull();
      expect(settingsRegistry.rxresumeMode.parse("latest")).toBeNull();
      expect(settingsRegistry.rxresumeMode.serialize("v5")).toBe("v5");
      expect(settingsRegistry.rxresumeMode.serialize(null)).toBeNull();
    });

    it("has env-backed v5 api key secret setting", () => {
      expect(settingsRegistry.rxresumeApiKey.envKey).toBe("RXRESUME_API_KEY");
    });

    it("has env-backed rxresumeUrl string setting", () => {
      expect(settingsRegistry.rxresumeUrl.envKey).toBe("RXRESUME_URL");
    });
  });

  describe("writing-style language settings", () => {
    it("defaults to manual english", () => {
      const previousLanguageMode = process.env.CHAT_STYLE_LANGUAGE_MODE;
      const previousManualLanguage = process.env.CHAT_STYLE_MANUAL_LANGUAGE;

      delete process.env.CHAT_STYLE_LANGUAGE_MODE;
      delete process.env.CHAT_STYLE_MANUAL_LANGUAGE;

      try {
        expect(settingsRegistry.chatStyleLanguageMode.default()).toBe("manual");
        expect(settingsRegistry.chatStyleManualLanguage.default()).toBe(
          "english",
        );
      } finally {
        if (previousLanguageMode === undefined) {
          delete process.env.CHAT_STYLE_LANGUAGE_MODE;
        } else {
          process.env.CHAT_STYLE_LANGUAGE_MODE = previousLanguageMode;
        }

        if (previousManualLanguage === undefined) {
          delete process.env.CHAT_STYLE_MANUAL_LANGUAGE;
        } else {
          process.env.CHAT_STYLE_MANUAL_LANGUAGE = previousManualLanguage;
        }
      }
    });

    it("parses and serializes supported language settings", () => {
      expect(settingsRegistry.chatStyleLanguageMode.parse("manual")).toBe(
        "manual",
      );
      expect(settingsRegistry.chatStyleLanguageMode.parse("match-resume")).toBe(
        "match-resume",
      );
      expect(settingsRegistry.chatStyleLanguageMode.parse("auto")).toBeNull();
      expect(settingsRegistry.chatStyleLanguageMode.parse("")).toBeNull();
      expect(
        settingsRegistry.chatStyleLanguageMode.serialize("match-resume"),
      ).toBe("match-resume");
      expect(settingsRegistry.chatStyleLanguageMode.serialize(null)).toBeNull();

      expect(settingsRegistry.chatStyleManualLanguage.parse("english")).toBe(
        "english",
      );
      expect(settingsRegistry.chatStyleManualLanguage.parse("german")).toBe(
        "german",
      );
      expect(
        settingsRegistry.chatStyleManualLanguage.parse("italian"),
      ).toBeNull();
      expect(settingsRegistry.chatStyleManualLanguage.parse("")).toBeNull();
      expect(
        settingsRegistry.chatStyleManualLanguage.serialize("spanish"),
      ).toBe("spanish");
      expect(
        settingsRegistry.chatStyleManualLanguage.serialize(null),
      ).toBeNull();
    });
  });

  describe("LLM provider parsing", () => {
    it("normalizes the documented openai-compatible alias", () => {
      expect(settingsRegistry.llmProvider.parse("openai-compatible")).toBe(
        "openai_compatible",
      );
      expect(settingsRegistry.llmProvider.parse("OPENAI-COMPATIBLE")).toBe(
        "openai_compatible",
      );
    });

    it("uses provider-specific default models", () => {
      expect(getDefaultModelForProvider("openai")).toBe("gpt-5.4-mini");
      expect(getDefaultModelForProvider("gemini")).toBe(
        "google/gemini-3-flash-preview",
      );
      expect(getDefaultModelForProvider("openrouter")).toBe(
        "google/gemini-3-flash-preview",
      );
    });
  });
});
