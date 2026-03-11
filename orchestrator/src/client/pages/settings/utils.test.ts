import { describe, expect, it } from "vitest";
import { getLlmProviderConfig, normalizeLlmProvider } from "./utils";

describe("settings utils", () => {
  it("treats openai-compatible as a dedicated configurable provider", () => {
    const config = getLlmProviderConfig("openai_compatible");

    expect(config.label).toBe("OpenAI-compatible");
    expect(config.showApiKey).toBe(true);
    expect(config.showBaseUrl).toBe(true);
    expect(config.baseUrlPlaceholder).toBe(
      "https://api.example.com/v1/chat/completions",
    );
  });

  it("normalizes the hyphenated openai-compatible alias", () => {
    expect(normalizeLlmProvider("openai-compatible")).toBe("openai_compatible");
  });

  it("defaults unknown providers to openrouter", () => {
    expect(normalizeLlmProvider("unknown-provider")).toBe("openrouter");
  });
});
