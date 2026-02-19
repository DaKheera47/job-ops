/**
 * Tests for the shared LLM service helper.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type JsonSchemaDefinition,
  LlmService,
  parseJsonContent,
} from "./llm-service";

const originalFetch = global.fetch;

const testSchema: JsonSchemaDefinition = {
  name: "test_schema",
  schema: {
    type: "object",
    properties: {
      value: { type: "string", description: "A test value" },
      count: { type: "integer", description: "A test count" },
    },
    required: ["value", "count"],
    additionalProperties: false,
  },
};

describe("LlmService", () => {
  beforeEach(() => {
    process.env.LLM_PROVIDER = "openrouter";
    process.env.OPENROUTER_API_KEY = "test-api-key";
    delete process.env.LLM_API_KEY;
    global.fetch = vi.fn();
  });

  afterEach(() => {
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.LLM_API_KEY;
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns error when API key is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;

    const llm = new LlmService();
    const result = await llm.callJson({
      model: "test-model",
      messages: [{ role: "user", content: "test" }],
      jsonSchema: testSchema,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("API key");
    }
  });

  it("returns parsed data on successful response", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: JSON.stringify({ value: "hello", count: 42 }) },
          },
        ],
      }),
    } as Response);

    const llm = new LlmService();

    // Backwards-compat: OPENROUTER_API_KEY should be copied to LLM_API_KEY.
    expect(process.env.LLM_API_KEY).toBe("test-api-key");

    const result = await llm.callJson<{ value: string; count: number }>({
      model: "test-model",
      messages: [{ role: "user", content: "test" }],
      jsonSchema: testSchema,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe("hello");
      expect(result.data.count).toBe(42);
    }
  });

  it("handles API errors gracefully", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    } as Response);

    const llm = new LlmService();
    const result = await llm.callJson({
      model: "test-model",
      messages: [{ role: "user", content: "test" }],
      jsonSchema: testSchema,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("500");
    }
  });

  it("handles empty response content", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "" } }],
      }),
    } as Response);

    const llm = new LlmService();
    const result = await llm.callJson({
      model: "test-model",
      messages: [{ role: "user", content: "test" }],
      jsonSchema: testSchema,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("No content");
    }
  });

  it("includes json_schema and OpenRouter plugins in request body", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"value": "test", "count": 1}' } }],
      }),
    } as Response);

    const llm = new LlmService();
    await llm.callJson({
      model: "test-model",
      messages: [{ role: "user", content: "test prompt" }],
      jsonSchema: testSchema,
    });

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);

    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("test_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.plugins[0].id).toBe("response-healing");
  });

  it("adds OpenRouter headers", async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"value": "test", "count": 1}' } }],
      }),
    } as Response);

    const llm = new LlmService();
    await llm.callJson({
      model: "test-model",
      messages: [{ role: "user", content: "test prompt" }],
      jsonSchema: testSchema,
    });

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const headers = fetchCall[1]?.headers as Record<string, string>;

    expect(headers.Authorization).toContain("Bearer");
    expect(headers["HTTP-Referer"]).toBe("JobOps");
    expect(headers["X-Title"]).toBe("JobOpsOrchestrator");
  });

  it("retries on parsing failures when maxRetries is set", async () => {
    let callCount = 0;
    vi.mocked(global.fetch).mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        return {
          ok: true,
          json: async () => ({
            choices: [{ message: { content: "invalid json" } }],
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          choices: [
            { message: { content: '{"value": "success", "count": 3}' } },
          ],
        }),
      } as Response;
    });

    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const llm = new LlmService();
    const result = await llm.callJson<{ value: string; count: number }>({
      model: "test-model",
      messages: [{ role: "user", content: "test" }],
      jsonSchema: testSchema,
      maxRetries: 2,
      retryDelayMs: 10,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe("success");
    }
    expect(callCount).toBe(3);
  });

  it("falls back to a looser mode when schema is rejected", async () => {
    process.env.LLM_PROVIDER = "lmstudio";
    delete process.env.OPENROUTER_API_KEY;

    vi.mocked(global.fetch).mockImplementation(async (_input, init) => {
      const body = JSON.parse(init?.body as string);
      if (body.response_format?.type === "json_schema") {
        return {
          ok: false,
          status: 400,
          text: async () =>
            JSON.stringify({
              error: "'response_format.type' must be 'json_schema' or 'text'",
            }),
        } as Response;
      }
      if (body.response_format?.type === "text") {
        return {
          ok: true,
          json: async () => ({
            choices: [
              {
                message: { content: '{"value": "ok", "count": 1}' },
              },
            ],
          }),
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: { content: '{"value": "fallback", "count": 2}' },
            },
          ],
        }),
      } as Response;
    });

    const llm = new LlmService();
    const result = await llm.callJson<{ value: string; count: number }>({
      model: "test-model",
      messages: [{ role: "user", content: "test" }],
      jsonSchema: testSchema,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe("ok");
    }
    expect(vi.mocked(global.fetch).mock.calls.length).toBe(2);
  });

  it("does not send Authorization header for Gemini key validation", async () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.LLM_API_KEY = "AIza-valid-gemini-key";
    delete process.env.OPENROUTER_API_KEY;

    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ models: [] }),
    } as Response);

    const llm = new LlmService();
    const result = await llm.validateCredentials();

    expect(result.valid).toBe(true);
    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const headers = fetchCall?.[1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });
});

describe("parseJsonContent", () => {
  it("parses clean JSON", () => {
    const result = parseJsonContent<{ foo: string }>('{"foo": "bar"}');
    expect(result.foo).toBe("bar");
  });

  it("handles markdown code fences", () => {
    const result = parseJsonContent<{ foo: string }>(
      '```json\n{"foo": "bar"}\n```',
    );
    expect(result.foo).toBe("bar");
  });

  it("handles json without language specifier", () => {
    const result = parseJsonContent<{ foo: string }>(
      '```\n{"foo": "bar"}\n```',
    );
    expect(result.foo).toBe("bar");
  });

  it("extracts JSON from surrounding text", () => {
    const result = parseJsonContent<{ foo: string }>(
      'Here is the result: {"foo": "bar"} as requested.',
    );
    expect(result.foo).toBe("bar");
  });

  it("throws on completely invalid content", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => parseJsonContent("not json at all")).toThrow();
  });
});
