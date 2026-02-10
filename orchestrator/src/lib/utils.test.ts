import { describe, expect, it } from "vitest";
import { safeFilenamePart } from "./utils";

describe("safeFilenamePart", () => {
  it("replaces non-alphanumeric characters with underscores", () => {
    expect(safeFilenamePart("Acme, Inc.")).toBe("Acme__Inc_");
  });

  it("falls back to Unknown when empty after cleaning", () => {
    expect(safeFilenamePart("")).toBe("Unknown");
    expect(safeFilenamePart("!!!")).toBe("Unknown");
  });
});
