import { describe, expect, it } from "vitest";
import { settingsRegistry } from "./settings-registry";

describe("settingsRegistry helpers", () => {
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
    });

    it("serializes bit bools correctly", () => {
      expect(settingsRegistry.showSponsorInfo.serialize(true)).toBe("1");
      expect(settingsRegistry.showSponsorInfo.serialize(false)).toBe("0");
      expect(settingsRegistry.showSponsorInfo.serialize(null)).toBeNull();
      expect(settingsRegistry.showSponsorInfo.serialize(undefined)).toBeNull();
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
  });
});
