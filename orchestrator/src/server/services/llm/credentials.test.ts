import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = { ...process.env };

describe("resolveLlmApiKey", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.LLM_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  async function loadResolver() {
    return import("./credentials");
  }

  it("prefers purpose-specific keys over stored and env values", async () => {
    process.env.LLM_API_KEY = "sk-env";
    const { resolveLlmApiKey } = await loadResolver();

    expect(
      resolveLlmApiKey({
        purposeApiKey: "sk-purpose",
        storedApiKey: "sk-stored",
        provider: "openai",
      }),
    ).toBe("sk-purpose");
  });

  it("falls back to LLM_API_KEY from the environment", async () => {
    process.env.LLM_API_KEY = "sk-env";
    const { resolveLlmApiKey } = await loadResolver();

    expect(
      resolveLlmApiKey({
        storedApiKey: "",
        provider: "openai",
      }),
    ).toBe("sk-env");
  });

  it("falls back to OPENROUTER_API_KEY for openrouter providers", async () => {
    process.env.OPENROUTER_API_KEY = "sk-openrouter";
    const { resolveLlmApiKey } = await loadResolver();

    expect(
      resolveLlmApiKey({
        provider: "openrouter",
      }),
    ).toBe("sk-openrouter");
  });

  it("ignores whitespace-only stored overrides", async () => {
    process.env.LLM_API_KEY = "sk-env";
    const { resolveLlmApiKey } = await loadResolver();

    expect(
      resolveLlmApiKey({
        storedApiKey: "   ",
        provider: "openai",
      }),
    ).toBe("sk-env");
  });
});
