import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveSettingValue,
  serializeSettingValue,
} from "./settings-conversion";

const originalEnv = { ...process.env };

describe("settings-conversion", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...originalEnv };
  });

  it("round-trips numeric settings", () => {
    const serialized = serializeSettingValue("ukvisajobsMaxJobs", 42);
    expect(serialized).toBe("42");

    const resolved = resolveSettingValue(
      "ukvisajobsMaxJobs",
      serialized ?? undefined,
    );
    expect(resolved.overrideValue).toBe(42);
    expect(resolved.value).toBe(42);
    expect(resolved.defaultValue).toBe(50);
  });

  it("round-trips adzuna numeric settings", () => {
    process.env.ADZUNA_MAX_JOBS_PER_TERM = "";
    const serialized = serializeSettingValue("adzunaMaxJobsPerTerm", 75);
    expect(serialized).toBe("75");

    const resolved = resolveSettingValue(
      "adzunaMaxJobsPerTerm",
      serialized ?? undefined,
    );
    expect(resolved.overrideValue).toBe(75);
    expect(resolved.value).toBe(75);
    expect(resolved.defaultValue).toBe(50);
  });

  it("round-trips boolean bit settings", () => {
    expect(serializeSettingValue("showSponsorInfo", true)).toBe("1");
    expect(serializeSettingValue("showSponsorInfo", false)).toBe("0");

    expect(resolveSettingValue("showSponsorInfo", "1").value).toBe(true);
    expect(resolveSettingValue("showSponsorInfo", "0").value).toBe(false);
    expect(resolveSettingValue("showSponsorInfo", "true").value).toBe(true);
    expect(resolveSettingValue("showSponsorInfo", "false").value).toBe(false);
  });

  it("round-trips JSON array settings", () => {
    const serialized = serializeSettingValue("searchTerms", [
      "backend",
      "platform",
    ]);
    expect(serialized).toBe('["backend","platform"]');

    const resolved = resolveSettingValue(
      "searchTerms",
      serialized ?? undefined,
    );
    expect(resolved.overrideValue).toEqual(["backend", "platform"]);
    expect(resolved.value).toEqual(["backend", "platform"]);
  });

  it("uses string defaults when override is empty", () => {
    process.env.JOBSPY_LOCATION = "Remote";
    const resolved = resolveSettingValue("searchCities", "");
    expect(resolved.defaultValue).toBe("Remote");
    expect(resolved.overrideValue).toBe("");
    expect(resolved.value).toBe("Remote");
  });

  it("applies clamped backup value parsing", () => {
    expect(resolveSettingValue("backupHour", "26").value).toBe(23);
    expect(resolveSettingValue("backupMaxCount", "0").value).toBe(1);
  });

  it("falls back to default for invalid numeric overrides", () => {
    const resolved = resolveSettingValue("ukvisajobsMaxJobs", "not-a-number");
    expect(resolved.overrideValue).toBeNull();
    expect(resolved.value).toBe(50);
  });

  it("falls back to default for invalid JSON array overrides", () => {
    const objectOverride = resolveSettingValue("searchTerms", '{"term":"x"}');
    expect(objectOverride.overrideValue).toBeNull();
    expect(objectOverride.value).toEqual(["web developer"]);

    const malformedOverride = resolveSettingValue("searchTerms", "[oops");
    expect(malformedOverride.overrideValue).toBeNull();
    expect(malformedOverride.value).toEqual(["web developer"]);
  });

  it("round-trips penalizeMissingSalary boolean setting", () => {
    expect(serializeSettingValue("penalizeMissingSalary", true)).toBe("1");
    expect(serializeSettingValue("penalizeMissingSalary", false)).toBe("0");

    expect(resolveSettingValue("penalizeMissingSalary", "1").value).toBe(true);
    expect(resolveSettingValue("penalizeMissingSalary", "0").value).toBe(false);
    expect(resolveSettingValue("penalizeMissingSalary", "true").value).toBe(
      true,
    );
    expect(resolveSettingValue("penalizeMissingSalary", undefined).value).toBe(
      false,
    );
  });

  it("round-trips missingSalaryPenalty numeric setting with clamping", () => {
    const serialized = serializeSettingValue("missingSalaryPenalty", 10);
    expect(serialized).toBe("10");

    const resolved = resolveSettingValue(
      "missingSalaryPenalty",
      serialized ?? undefined,
    );
    expect(resolved.overrideValue).toBe(10);
    expect(resolved.value).toBe(10);
    expect(resolved.defaultValue).toBe(10);

    // Test clamping
    expect(resolveSettingValue("missingSalaryPenalty", "150").value).toBe(100);
    expect(resolveSettingValue("missingSalaryPenalty", "-5").value).toBe(0);
    expect(resolveSettingValue("missingSalaryPenalty", "0").value).toBe(0);
    expect(resolveSettingValue("missingSalaryPenalty", "100").value).toBe(100);
  });

  it("round-trips autoSkipScoreThreshold with clamping and null fallback", () => {
    const serialized = serializeSettingValue("autoSkipScoreThreshold", 35);
    expect(serialized).toBe("35");

    const resolved = resolveSettingValue(
      "autoSkipScoreThreshold",
      serialized ?? undefined,
    );
    expect(resolved.overrideValue).toBe(35);
    expect(resolved.value).toBe(35);
    expect(resolved.defaultValue).toBeNull();

    // Test clamping
    expect(resolveSettingValue("autoSkipScoreThreshold", "150").value).toBe(
      100,
    );
    expect(resolveSettingValue("autoSkipScoreThreshold", "-5").value).toBe(0);
    expect(resolveSettingValue("autoSkipScoreThreshold", "0").value).toBe(0);
    expect(resolveSettingValue("autoSkipScoreThreshold", "100").value).toBe(
      100,
    );

    // Test explicit null handling
    expect(serializeSettingValue("autoSkipScoreThreshold", null)).toBeNull();
    expect(resolveSettingValue("autoSkipScoreThreshold", undefined).value).toBe(
      null,
    );
    expect(resolveSettingValue("autoSkipScoreThreshold", "null").value).toBe(
      null,
    );
    expect(resolveSettingValue("autoSkipScoreThreshold", "").value).toBe(null);

    // Invalid input falls back to default (null)
    const invalid = resolveSettingValue(
      "autoSkipScoreThreshold",
      "not-a-number",
    );
    expect(invalid.overrideValue).toBeNull();
    expect(invalid.value).toBeNull();
  });

  it("respects environment variables for new salary settings", () => {
    process.env.PENALIZE_MISSING_SALARY = "true";
    process.env.MISSING_SALARY_PENALTY = "25";

    const penalizeResolved = resolveSettingValue(
      "penalizeMissingSalary",
      undefined,
    );
    expect(penalizeResolved.defaultValue).toBe(true);
    expect(penalizeResolved.value).toBe(true);

    const penaltyResolved = resolveSettingValue(
      "missingSalaryPenalty",
      undefined,
    );
    expect(penaltyResolved.defaultValue).toBe(25);
    expect(penaltyResolved.value).toBe(25);
  });
});
