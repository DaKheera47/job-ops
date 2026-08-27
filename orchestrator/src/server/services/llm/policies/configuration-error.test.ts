import { describe, expect, it } from "vitest";
import { isConfigurationFailure } from "./configuration-error";

describe("isConfigurationFailure", () => {
  it("flags a missing API key", () => {
    expect(isConfigurationFailure("LLM API key not configured")).toBe(true);
  });

  it("flags rejected credentials", () => {
    expect(isConfigurationFailure("LLM API error: 401 - Invalid API key")).toBe(
      true,
    );
    expect(isConfigurationFailure("LLM API error: 403 - Forbidden")).toBe(true);
  });

  it("flags CLI providers that are not logged in", () => {
    expect(
      isConfigurationFailure(
        "Codex is not authenticated in this container. Run `codex login` and try again.",
      ),
    ).toBe(true);
    expect(isConfigurationFailure("Gemini CLI is not logged in")).toBe(true);
  });

  it("does not flag transient provider faults", () => {
    expect(isConfigurationFailure("No content in response")).toBe(false);
    expect(isConfigurationFailure("Rate limit exceeded")).toBe(false);
    expect(isConfigurationFailure("LLM API error: 429 - slow down")).toBe(
      false,
    );
    expect(isConfigurationFailure("LLM API error: 500 - internal error")).toBe(
      false,
    );
    expect(isConfigurationFailure("Request timed out")).toBe(false);
    expect(
      isConfigurationFailure("Unable to parse JSON from model response"),
    ).toBe(false);
  });

  it("does not flag a 404 or other 4xx as configuration", () => {
    expect(isConfigurationFailure("LLM API error: 404 - not found")).toBe(
      false,
    );
    expect(isConfigurationFailure("LLM API error: 400 - bad request")).toBe(
      false,
    );
  });
});
