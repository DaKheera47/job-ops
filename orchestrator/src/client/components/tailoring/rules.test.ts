import { describe, expect, it } from "vitest";
import { canFinalizeTailoring } from "./rules";

describe("canFinalizeTailoring", () => {
  it("returns true when summary has non-whitespace content", () => {
    expect(canFinalizeTailoring("Summary")).toBe(true);
  });

  it("returns false when summary is empty", () => {
    expect(canFinalizeTailoring("   ")).toBe(false);
  });
});
