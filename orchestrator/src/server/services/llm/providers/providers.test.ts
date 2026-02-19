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
    expect(lmStudioStrategy.extractText(response)).toBe("ok");
    expect(ollamaStrategy.extractText(response)).toBe("ok");
  });

  it("extracts text for openai and gemini variants", () => {
    expect(openAiStrategy.extractText({ output_text: "openai-direct" })).toBe(
      "openai-direct",
    );
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

  it("strips unsupported additionalProperties keys from Gemini responseSchema", () => {
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
          required: ["skills"],
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
    const itemSchema = skills.items as Record<string, unknown>;

    expect(responseSchema.additionalProperties).toBeUndefined();
    expect(itemSchema.additionalProperties).toBeUndefined();
  });
});
