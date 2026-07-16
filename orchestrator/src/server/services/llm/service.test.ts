import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeCliClient } from "./claude-cli/client";
import { CodexClient } from "./codex/client";
import { GeminiCliClient } from "./gemini-cli/client";
import { LlmService } from "./service";

describe("LlmService provider normalization", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps legacy localhost openai_compatible configs on LM Studio", () => {
    const llm = new LlmService({
      provider: "openai_compatible",
      baseUrl: "http://localhost:1234",
    });

    expect(llm.getProvider()).toBe("lmstudio");
    expect(llm.getBaseUrl()).toBe("http://localhost:1234");
  });

  it("uses the dedicated provider for non-local OpenAI-compatible endpoints", () => {
    const llm = new LlmService({
      provider: "openai_compatible",
      baseUrl: "https://llm.example.com",
    });

    expect(llm.getProvider()).toBe("openai_compatible");
    expect(llm.getBaseUrl()).toBe("https://llm.example.com");
  });

  it("normalizes the hyphenated openai-compatible alias", () => {
    const llm = new LlmService({
      provider: "openai-compatible",
      baseUrl: "https://llm.example.com",
    });

    expect(llm.getProvider()).toBe("openai_compatible");
    expect(llm.getBaseUrl()).toBe("https://llm.example.com");
  });

  it("supports codex provider normalization", () => {
    const llm = new LlmService({
      provider: "codex",
    });

    expect(llm.getProvider()).toBe("codex");
    expect(llm.getBaseUrl()).toBe("");
  });

  it("supports gemini_cli provider normalization", () => {
    const llm = new LlmService({
      provider: "gemini-cli",
    });

    expect(llm.getProvider()).toBe("gemini_cli");
    expect(llm.getBaseUrl()).toBe("");
  });

  it("supports claude_cli provider normalization", () => {
    const llm = new LlmService({
      provider: "claude-cli",
    });

    expect(llm.getProvider()).toBe("claude_cli");
    expect(llm.getBaseUrl()).toBe("");
  });

  it("supports GLM provider normalization and aliases", () => {
    const glm = new LlmService({
      provider: "glm",
    });
    const zhipu = new LlmService({
      provider: "zhipu-ai",
    });

    expect(glm.getProvider()).toBe("glm");
    expect(glm.getBaseUrl()).toBe("https://api.z.ai/api/paas/v4");
    expect(zhipu.getProvider()).toBe("glm");
  });

  it("supports Anthropic provider normalization and Claude alias", () => {
    const anthropic = new LlmService({
      provider: "anthropic",
    });
    const claude = new LlmService({
      provider: "claude",
    });

    expect(anthropic.getProvider()).toBe("anthropic");
    expect(anthropic.getBaseUrl()).toBe("https://api.anthropic.com");
    expect(claude.getProvider()).toBe("anthropic");
    expect(claude.getBaseUrl()).toBe("https://api.anthropic.com");
  });

  it("ignores stale configured base URLs for native Anthropic", () => {
    const llm = new LlmService({
      provider: "anthropic",
      baseUrl: "https://openrouter.ai",
    });

    expect(llm.getProvider()).toBe("anthropic");
    expect(llm.getBaseUrl()).toBe("https://api.anthropic.com");
  });

  it("retries codex JSON parsing failures and succeeds on a later attempt", async () => {
    const codexCallSpy = vi
      .spyOn(CodexClient.prototype, "callJson")
      .mockResolvedValueOnce({ text: "not-json", turnId: "turn-1" })
      .mockResolvedValueOnce({
        text: '{"value":"ok"}',
        turnId: "turn-2",
      });

    const llm = new LlmService({ provider: "codex" });
    const result = await llm.callJson<{ value: string }>({
      model: "",
      messages: [{ role: "user", content: "Return JSON." }],
      jsonSchema: {
        name: "test",
        schema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
      },
      maxRetries: 1,
      retryDelayMs: 1,
    });

    expect(result).toEqual({ success: true, data: { value: "ok" } });
    expect(codexCallSpy).toHaveBeenCalledTimes(2);
  });

  it("delegates codex credential validation to the codex client", async () => {
    const validateSpy = vi
      .spyOn(CodexClient.prototype, "validateCredentials")
      .mockResolvedValue({ valid: true, message: null });

    const llm = new LlmService({ provider: "codex" });
    const result = await llm.validateCredentials();

    expect(result).toEqual({ valid: true, message: null });
    expect(validateSpy).toHaveBeenCalledOnce();
  });

  it("delegates codex model discovery to the codex client", async () => {
    const listSpy = vi
      .spyOn(CodexClient.prototype, "listModels")
      .mockResolvedValue(["gpt-5", "o4-mini"]);

    const llm = new LlmService({ provider: "codex" });
    const models = await llm.listModels();

    expect(models).toEqual(["gpt-5", "o4-mini"]);
    expect(listSpy).toHaveBeenCalledOnce();
  });

  it("delegates gemini_cli credential validation to the Gemini CLI client", async () => {
    const validateSpy = vi
      .spyOn(GeminiCliClient.prototype, "validateCredentials")
      .mockResolvedValue({ valid: true, message: null });

    const llm = new LlmService({ provider: "gemini_cli" });
    const result = await llm.validateCredentials();

    expect(result).toEqual({ valid: true, message: null });
    expect(validateSpy).toHaveBeenCalledOnce();
  });

  it("returns curated models for gemini_cli", async () => {
    const llm = new LlmService({ provider: "gemini_cli" });
    const models = await llm.listModels();

    expect(models[0]).toBe("google/gemini-3-flash-preview");
    expect(models.length).toBeGreaterThan(1);
  });

  it("delegates claude_cli credential validation to the Claude CLI client", async () => {
    const validateSpy = vi
      .spyOn(ClaudeCliClient.prototype, "validateCredentials")
      .mockResolvedValue({ valid: true, message: null });

    const llm = new LlmService({ provider: "claude_cli" });
    const result = await llm.validateCredentials();

    expect(result).toEqual({ valid: true, message: null });
    expect(validateSpy).toHaveBeenCalledOnce();
  });

  it("returns curated models for claude_cli", async () => {
    const llm = new LlmService({ provider: "claude_cli" });
    const models = await llm.listModels();

    expect(models[0]).toBe("claude-sonnet-5");
    expect(models.length).toBeGreaterThan(1);
  });
});
