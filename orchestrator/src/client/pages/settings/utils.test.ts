import { describe, expect, it } from "vitest";
import {
  getLlmProviderConfig,
  normalizeLlmProvider,
  supportsLlmModelSuggestions,
} from "./utils";

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

  it("exposes provider key links for hosted providers", () => {
    expect(getLlmProviderConfig("openrouter").keyHelperHref).toBe(
      "https://openrouter.ai/keys",
    );
    expect(getLlmProviderConfig("openai").keyHelperHref).toBe(
      "https://platform.openai.com/api-keys",
    );
    expect(getLlmProviderConfig("gemini").keyHelperHref).toBe(
      "https://aistudio.google.com/app/apikey",
    );
    expect(getLlmProviderConfig("ollama").keyHelperHref).toBeNull();
  });

  it("normalizes the hyphenated openai-compatible alias", () => {
    expect(normalizeLlmProvider("openai-compatible")).toBe("openai_compatible");
  });

  it("defaults unknown providers to openrouter", () => {
    expect(normalizeLlmProvider("unknown-provider")).toBe("openrouter");
  });

  it("only enables model suggestions for supported providers", () => {
    expect(supportsLlmModelSuggestions("openai")).toBe(true);
    expect(supportsLlmModelSuggestions("gemini")).toBe(true);
    expect(supportsLlmModelSuggestions("ollama")).toBe(true);
    expect(supportsLlmModelSuggestions("openrouter")).toBe(false);
  });
});
