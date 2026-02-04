import { describe, expect, it } from "vitest";
import { geminiStrategy } from "./gemini";
import { lmStudioStrategy } from "./lmstudio";
import { ollamaStrategy } from "./ollama";
import { openAiStrategy } from "./openai";
import { openRouterStrategy } from "./openrouter";

const schema = {
  name: "test_schema",
  schema: {
    type: "object" as const,
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
};

const messages = [{ role: "user" as const, content: "hello" }];

describe("provider adapters", () => {
  it("builds OpenRouter request", () => {
    const request = openRouterStrategy.buildRequest({
      mode: "json_schema",
      baseUrl: "https://openrouter.ai",
      apiKey: "x",
      model: "model-a",
      messages,
      jsonSchema: schema,
    });
    expect(request.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    const body = request.body as Record<string, unknown>;
    expect((body.response_format as Record<string, unknown>).type).toBe(
      "json_schema",
    );
  });

  it("builds OpenAI request", () => {
    const request = openAiStrategy.buildRequest({
      mode: "json_object",
      baseUrl: "https://api.openai.com",
      apiKey: "x",
      model: "model-a",
      messages,
      jsonSchema: schema,
    });
    expect(request.url).toBe("https://api.openai.com/v1/responses");
    const body = request.body as Record<string, unknown>;
    expect(body.model).toBe("model-a");
  });

  it("builds Gemini request", () => {
    const request = geminiStrategy.buildRequest({
      mode: "json_schema",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "x",
      model: "gemini-1.5-flash",
      messages,
      jsonSchema: schema,
    });
    expect(request.url).toContain(":generateContent");
    expect(request.url).toContain("key=x");
  });

  it("builds LMStudio request", () => {
    const request = lmStudioStrategy.buildRequest({
      mode: "text",
      baseUrl: "http://localhost:1234",
      apiKey: null,
      model: "local",
      messages,
      jsonSchema: schema,
    });
    expect(request.url).toBe("http://localhost:1234/v1/chat/completions");
    const body = request.body as Record<string, unknown>;
    expect((body.response_format as Record<string, unknown>).type).toBe("text");
  });

  it("builds Ollama request", () => {
    const request = ollamaStrategy.buildRequest({
      mode: "none",
      baseUrl: "http://localhost:11434",
      apiKey: null,
      model: "local",
      messages,
      jsonSchema: schema,
    });
    expect(request.url).toBe("http://localhost:11434/v1/chat/completions");
    const body = request.body as Record<string, unknown>;
    expect(body.model).toBe("local");
  });
});
