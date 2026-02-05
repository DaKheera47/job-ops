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

  it("round-trips boolean bit settings", () => {
    expect(serializeSettingValue("jobspyIsRemote", true)).toBe("1");
    expect(serializeSettingValue("jobspyIsRemote", false)).toBe("0");

    expect(resolveSettingValue("jobspyIsRemote", "1").value).toBe(true);
    expect(resolveSettingValue("jobspyIsRemote", "0").value).toBe(false);
    expect(resolveSettingValue("jobspyIsRemote", "true").value).toBe(true);
    expect(resolveSettingValue("jobspyIsRemote", "false").value).toBe(false);
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
    const resolved = resolveSettingValue("jobspyLocation", "");
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
});
