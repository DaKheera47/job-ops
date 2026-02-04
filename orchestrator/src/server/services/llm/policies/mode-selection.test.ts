import { describe, expect, it } from "vitest";
import {
  buildModeCacheKey,
  clearModeCache,
  getOrderedModes,
  rememberSuccessfulMode,
} from "./mode-selection";

describe("mode-selection policy", () => {
  it("returns provider modes in declared order when cache is empty", () => {
    clearModeCache();
    const key = buildModeCacheKey("openrouter", "https://openrouter.ai");
    expect(getOrderedModes(key, ["json_schema", "none"])).toEqual([
      "json_schema",
      "none",
    ]);
  });

  it("prefers cached mode first", () => {
    clearModeCache();
    const key = buildModeCacheKey("lmstudio", "http://localhost:1234");
    rememberSuccessfulMode(key, "text");

    expect(getOrderedModes(key, ["json_schema", "text", "none"])).toEqual([
      "text",
      "json_schema",
      "none",
    ]);
  });

  it("keeps cache scoped by provider+baseUrl", () => {
    clearModeCache();
    const keyA = buildModeCacheKey("lmstudio", "http://localhost:1234");
    const keyB = buildModeCacheKey("lmstudio", "http://localhost:1235");
    rememberSuccessfulMode(keyA, "text");

    expect(getOrderedModes(keyA, ["json_schema", "text", "none"])).toEqual([
      "text",
      "json_schema",
      "none",
    ]);
    expect(getOrderedModes(keyB, ["json_schema", "text", "none"])).toEqual([
      "json_schema",
      "text",
      "none",
    ]);
  });
});
