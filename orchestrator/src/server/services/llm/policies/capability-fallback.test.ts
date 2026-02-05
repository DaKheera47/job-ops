import { describe, expect, it } from "vitest";
import { isCapabilityError } from "./capability-fallback";

describe("capability fallback policy", () => {
  it("detects structured output capability errors", () => {
    expect(
      isCapabilityError({
        mode: "json_schema",
        status: 400,
        body: "response_format json_schema is unsupported",
      }),
    ).toBe(true);
  });

  it("excludes model-not-found errors", () => {
    expect(
      isCapabilityError({
        mode: "json_schema",
        status: 400,
        body: "unknown model: test-model",
      }),
    ).toBe(false);
  });

  it("never treats none mode as capability fallback", () => {
    expect(
      isCapabilityError({
        mode: "none",
        status: 400,
        body: "response_format json_schema is unsupported",
      }),
    ).toBe(false);
  });
});
