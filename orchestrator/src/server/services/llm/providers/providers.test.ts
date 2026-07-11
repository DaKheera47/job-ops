import { describe, expect, it } from "vitest";
import { anthropicStrategy } from "./anthropic";
import { geminiStrategy } from "./gemini";
import { glmStrategy } from "./glm";
import { lmStudioStrategy } from "./lmstudio";
import { ollamaStrategy } from "./ollama";
import { openAiStrategy } from "./openai";
import { openAiCompatibleStrategy } from "./openai-compatible";
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
  it("builds requests for each provider/mode path", () => {
    const cases = [
      {
        name: "openrouter-json_schema",
        strategy: openRouterStrategy,
        args: {
          mode: "json_schema" as const,
          baseUrl: "https://openrouter.ai",
          apiKey: "x",
          model: "model-a",
        },
        expectedUrl: "https://openrouter.ai/api/v1/chat/completions",
        expectedResponseFormat: "json_schema",
      },
      {
        name: "openai-json_object",
        strategy: openAiStrategy,
        args: {
          mode: "json_object" as const,
          baseUrl: "https://api.openai.com",
          apiKey: "x",
          model: "model-a",
        },
        expectedUrl: "https://api.openai.com/v1/responses",
      },
      {
        name: "anthropic-json_schema",
        strategy: anthropicStrategy,
        args: {
          mode: "json_schema" as const,
          baseUrl: "https://api.anthropic.com",
          apiKey: "x",
          model: "claude-sonnet-4-6",
        },
        expectedUrl: "https://api.anthropic.com/v1/messages",
      },
      {
        name: "openai-compatible-json_object",
        strategy: openAiCompatibleStrategy,
        args: {
          mode: "json_object" as const,
          baseUrl: "https://llm.example.com/v1/chat/completions",
          apiKey: "x",
          model: "model-a",
        },
        expectedUrl: "https://llm.example.com/v1/chat/completions",
        expectedResponseFormat: "json_object",
      },
      {
        name: "openai-compatible-json_object-base-root",
        strategy: openAiCompatibleStrategy,
        args: {
          mode: "json_object" as const,
          baseUrl: "https://llm.example.com",
          apiKey: "x",
          model: "model-a",
        },
        expectedUrl: "https://llm.example.com/v1/chat/completions",
        expectedResponseFormat: "json_object",
      },
      {
        name: "openai-compatible-json_object-base-v1",
        strategy: openAiCompatibleStrategy,
        args: {
          mode: "json_object" as const,
          baseUrl: "https://llm.example.com/v1/",
          apiKey: "x",
          model: "model-a",
        },
        expectedUrl: "https://llm.example.com/v1/chat/completions",
        expectedResponseFormat: "json_object",
      },
      {
        name: "glm-json_object",
        strategy: glmStrategy,
        args: {
          mode: "json_object" as const,
          baseUrl: "https://api.z.ai/api/paas/v4",
          apiKey: "x",
          model: "glm-5.1",
        },
        expectedUrl: "https://api.z.ai/api/paas/v4/chat/completions",
        expectedResponseFormat: "json_object",
      },
      {
        name: "glm-json_object-full-endpoint",
        strategy: glmStrategy,
        args: {
          mode: "json_object" as const,
          baseUrl: "https://api.z.ai/api/paas/v4/chat/completions",
          apiKey: "x",
          model: "glm-5.1",
        },
        expectedUrl: "https://api.z.ai/api/paas/v4/chat/completions",
        expectedResponseFormat: "json_object",
      },
      {
        name: "gemini-json_schema",
        strategy: geminiStrategy,
        args: {
          mode: "json_schema" as const,
          baseUrl: "https://generativelanguage.googleapis.com",
          apiKey: "x",
          model: "gemini-1.5-flash",
        },
        expectedUrlContains: [":generateContent", "key=x"],
      },
      {
        name: "lmstudio-text",
        strategy: lmStudioStrategy,
        args: {
          mode: "text" as const,
          baseUrl: "http://localhost:1234",
          apiKey: null,
          model: "local",
        },
        expectedUrl: "http://localhost:1234/v1/chat/completions",
        expectedResponseFormat: "text",
      },
      {
        name: "ollama-none",
        strategy: ollamaStrategy,
        args: {
          mode: "none" as const,
          baseUrl: "http://localhost:11434",
          apiKey: null,
          model: "local",
        },
        expectedUrl: "http://localhost:11434/v1/chat/completions",
      },
    ];

    for (const testCase of cases) {
      const request = testCase.strategy.buildRequest({
        ...testCase.args,
        messages,
        jsonSchema: schema,
      });

      if (testCase.expectedUrl) {
        expect(request.url, testCase.name).toBe(testCase.expectedUrl);
      }
      if (testCase.expectedUrlContains) {
        for (const expectedPart of testCase.expectedUrlContains) {
          expect(request.url, testCase.name).toContain(expectedPart);
        }
      }

      if (testCase.expectedResponseFormat) {
        const body = request.body as Record<string, unknown>;
        expect(
          (body.response_format as Record<string, unknown>).type,
          testCase.name,
        ).toBe(testCase.expectedResponseFormat);
      }
    }
  });

  it("extracts text consistently for chat-completions providers", () => {
    const response = {
      choices: [{ message: { content: "ok" } }],
    };
    expect(openRouterStrategy.extractText(response)).toBe("ok");
    expect(glmStrategy.extractText(response)).toBe("ok");
    expect(lmStudioStrategy.extractText(response)).toBe("ok");
    expect(ollamaStrategy.extractText(response)).toBe("ok");
  });

  it("sends optional bearer auth for Ollama chat requests", () => {
    const request = ollamaStrategy.buildRequest({
      mode: "none",
      baseUrl: "http://localhost:11434",
      apiKey: "local-token",
      model: "llama3:latest",
      messages,
      jsonSchema: schema,
    });

    expect(request.headers.Authorization).toBe("Bearer local-token");
  });

  it("builds validation URLs for GLM base URLs and endpoints", () => {
    expect(
      glmStrategy.getValidationUrls({
        baseUrl: "https://api.z.ai/api/paas/v4",
        apiKey: "x",
      }),
    ).toEqual(["https://api.z.ai/api/paas/v4/models"]);
    expect(
      glmStrategy.getValidationUrls({
        baseUrl: "https://api.z.ai/api/paas/v4/chat/completions",
        apiKey: "x",
      }),
    ).toEqual(["https://api.z.ai/api/paas/v4/models"]);
  });

  it("builds validation URLs for OpenAI-compatible base URLs and endpoints", () => {
    expect(
      openAiCompatibleStrategy.getValidationUrls({
        baseUrl: "https://llm.example.com",
        apiKey: "x",
      }),
    ).toEqual(["https://llm.example.com/v1/models"]);
    expect(
      openAiCompatibleStrategy.getValidationUrls({
        baseUrl: "https://llm.example.com/v1/",
        apiKey: "x",
      }),
    ).toEqual(["https://llm.example.com/v1/models"]);
    expect(
      openAiCompatibleStrategy.getValidationUrls({
        baseUrl: "https://llm.example.com/v1/chat/completions",
        apiKey: "x",
      }),
    ).toEqual(["https://llm.example.com/v1/models"]);
  });

  it("extracts text for openai and gemini variants", () => {
    expect(openAiStrategy.extractText({ output_text: "openai-direct" })).toBe(
      "openai-direct",
    );
    expect(
      anthropicStrategy.extractText({
        content: [
          { type: "text", text: "hello " },
          { type: "thinking", thinking: "hidden" },
          { type: "text", text: "claude" },
        ],
      }),
    ).toBe("hello claude");
    expect(
      openAiStrategy.extractText({
        output: [
          {
            content: [{ type: "output_text", text: "openai-nested" }],
          },
        ],
      }),
    ).toBe("openai-nested");

    expect(
      geminiStrategy.extractText({
        candidates: [{ content: { parts: [{ text: "gemini" }] } }],
      }),
    ).toBe("gemini");
  });

  it("sends Gemini structured outputs through the JSON Schema responseSchema", () => {
    const request = geminiStrategy.buildRequest({
      mode: "json_schema",
      baseUrl: "https://generativelanguage.googleapis.com",
      apiKey: "x",
      model: "gemini-2.5-flash",
      messages,
      jsonSchema: {
        name: "resume_tailoring",
        schema: {
          type: "object",
          properties: {
            bestMatchIndex: {
              type: ["integer", "null"],
              description:
                "Best matching active-job index from provided list, or null.",
            },
            skills: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  keywords: { type: "array", items: { type: "string" } },
                },
                required: ["name", "keywords"],
                additionalProperties: false,
              },
            },
          },
          required: ["bestMatchIndex", "skills"],
          additionalProperties: false,
        },
      },
    });

    const generationConfig = (request.body as Record<string, unknown>)
      .generationConfig as Record<string, unknown>;
    const responseSchema = generationConfig.responseSchema as Record<
      string,
      unknown
    >;
    const skills = (responseSchema.properties as Record<string, unknown>)
      .skills as Record<string, unknown>;
    const bestMatchIndex = (
      responseSchema.properties as Record<string, unknown>
    ).bestMatchIndex as Record<string, unknown>;
    const itemSchema = skills.items as Record<string, unknown>;

    expect(generationConfig.responseMimeType).toBe("application/json");
    expect(bestMatchIndex.type).toEqual(["integer", "null"]);
    expect(responseSchema.additionalProperties).toBeUndefined();
    expect(responseSchema.propertyOrdering).toEqual([
      "bestMatchIndex",
      "skills",
    ]);
    expect(itemSchema.additionalProperties).toBeUndefined();
    expect(itemSchema.propertyOrdering).toEqual(["name", "keywords"]);
  });

  it("builds native Anthropic Messages API requests", () => {
    const request = anthropicStrategy.buildRequest({
      mode: "json_schema",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant",
      model: "claude-sonnet-4-6",
      messages: [
        { role: "system", content: "You are concise." },
        {
          role: "user",
          content: [
            { type: "text", text: "Read this image." },
            {
              type: "image",
              imageUrl: "data:image/png;base64,abc123",
              mediaType: "image/png",
            },
          ],
        },
      ],
      jsonSchema: schema,
    });

    expect(request.url).toBe("https://api.anthropic.com/v1/messages");
    expect(request.headers).toMatchObject({
      "anthropic-version": "2023-06-01",
      "x-api-key": "sk-ant",
    });
    expect(request.headers).not.toHaveProperty("Authorization");
    expect(request.body).toMatchObject({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: "You are concise.",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Read this image." },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "abc123",
              },
            },
          ],
        },
      ],
      output_config: {
        format: {
          type: "json_schema",
          schema: schema.schema,
        },
      },
    });
  });

  it("strips JSON Schema keywords Anthropic does not support", () => {
    const request = anthropicStrategy.buildRequest({
      mode: "json_schema",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant",
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "hi" }],
      jsonSchema: {
        name: "job_brief",
        schema: {
          type: "object",
          properties: {
            they_want: {
              type: "array",
              maxItems: 6,
              minItems: 1,
              items: { type: "string", maxLength: 200 },
            },
            // A property legitimately named like a stripped keyword must survive.
            format: { type: "string" },
          },
          required: ["they_want"],
          additionalProperties: false,
        },
      },
    });

    const sentSchema = (
      request.body as {
        output_config: { format: { schema: Record<string, unknown> } };
      }
    ).output_config.format.schema;
    const properties = sentSchema.properties as Record<
      string,
      Record<string, unknown>
    >;

    expect(properties.they_want).not.toHaveProperty("maxItems");
    expect(properties.they_want).not.toHaveProperty("minItems");
    expect(properties.they_want.items).not.toHaveProperty("maxLength");
    // The nested array type and its items are still present.
    expect(properties.they_want).toMatchObject({
      type: "array",
      items: { type: "string" },
    });
    // A property whose name collides with a stripped keyword is preserved.
    expect(properties).toHaveProperty("format");
    expect(properties.format).toMatchObject({ type: "string" });
  });
});
