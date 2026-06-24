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
    expect(getLlmProviderConfig("anthropic").keyHelperHref).toBe(
      "https://platform.claude.com/settings/keys",
    );
    expect(getLlmProviderConfig("glm").keyHelperHref).toBe(
      "https://z.ai/manage-apikey/apikey-list",
    );
    expect(getLlmProviderConfig("gemini").keyHelperHref).toBe(
      "https://aistudio.google.com/app/apikey",
    );
    expect(getLlmProviderConfig("ollama").keyHelperHref).toBeNull();
    expect(getLlmProviderConfig("gemini_cli").keyHelperHref).toBeNull();
    expect(getLlmProviderConfig("codex").keyHelperHref).toBeNull();
  });

  it("treats codex as a local provider without API key and base URL inputs", () => {
    const config = getLlmProviderConfig("codex");
    expect(config.showApiKey).toBe(false);
    expect(config.showBaseUrl).toBe(false);
  });

  it("treats gemini_cli as a local provider without API key and base URL inputs", () => {
    const config = getLlmProviderConfig("gemini_cli");
    expect(config.showApiKey).toBe(false);
    expect(config.showBaseUrl).toBe(false);
  });

  it("treats Ollama as a local provider with an optional API key", () => {
    const config = getLlmProviderConfig("ollama");

    expect(config.showApiKey).toBe(true);
    expect(config.requiresApiKey).toBe(false);
    expect(config.providerHint).toBe(
      "Ollama typically runs locally. Add an API key only for Ollama-compatible endpoints protected by bearer auth.",
    );
    expect(config.keyHelperText).toBe(
      "Optional bearer token for Ollama-compatible endpoints that require auth",
    );
  });

  it("explains Docker host URLs for Ollama without changing the placeholder", () => {
    const config = getLlmProviderConfig("ollama");

    expect(config.baseUrlPlaceholder).toBe("http://localhost:11434");
    expect(config.baseUrlHelper).toContain("http://localhost:11434");
    expect(config.baseUrlHelper).toContain("http://host.docker.internal:11434");
    expect(config.baseUrlHelper).toContain("http://172.17.0.1:11434");
  });

  it("normalizes the hyphenated openai-compatible alias", () => {
    expect(normalizeLlmProvider("openai-compatible")).toBe("openai_compatible");
  });

  it("treats GLM as a hosted API-key provider with a configurable base URL", () => {
    const config = getLlmProviderConfig("zhipu-ai");

    expect(config.normalizedProvider).toBe("glm");
    expect(config.label).toBe("GLM");
    expect(config.showApiKey).toBe(true);
    expect(config.showBaseUrl).toBe(true);
    expect(config.baseUrlPlaceholder).toBe("https://api.z.ai/api/paas/v4");
  });

  it("treats Anthropic as a hosted native API-key provider", () => {
    const config = getLlmProviderConfig("claude");

    expect(config.normalizedProvider).toBe("anthropic");
    expect(config.label).toBe("Claude (Anthropic)");
    expect(config.showApiKey).toBe(true);
    expect(config.requiresApiKey).toBe(true);
    expect(config.showBaseUrl).toBe(false);
    expect(config.providerHint).toBe(
      "Claude uses Anthropic's native Messages API with your Anthropic API key.",
    );
  });

  it("defaults unknown providers to openrouter", () => {
    expect(normalizeLlmProvider("unknown-provider")).toBe("openrouter");
  });

  it("only enables model suggestions for supported providers", () => {
    expect(supportsLlmModelSuggestions("openai")).toBe(true);
    expect(supportsLlmModelSuggestions("anthropic")).toBe(true);
    expect(supportsLlmModelSuggestions("glm")).toBe(true);
    expect(supportsLlmModelSuggestions("gemini")).toBe(true);
    expect(supportsLlmModelSuggestions("gemini_cli")).toBe(true);
    expect(supportsLlmModelSuggestions("ollama")).toBe(true);
    expect(supportsLlmModelSuggestions("openrouter")).toBe(false);
  });
});
