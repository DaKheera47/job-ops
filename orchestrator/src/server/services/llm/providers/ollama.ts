import { isCapabilityError } from "../policies/capability-fallback";
import type { ProviderStrategy } from "../types";
import { buildHeaders, joinUrl } from "../utils/http";
import { getNestedValue } from "../utils/object";

export const ollamaStrategy: ProviderStrategy = {
  provider: "ollama",
  defaultBaseUrl: "http://localhost:11434",
  requiresApiKey: false,
  modes: ["json_schema", "text", "none"],
  validationPaths: ["/v1/models", "/api/tags"],
  buildRequest: ({ mode, baseUrl, model, messages, jsonSchema }) => {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
    };

    if (mode === "json_schema") {
      body.response_format = {
        type: "json_schema",
        json_schema: {
          name: jsonSchema.name,
          strict: true,
          schema: jsonSchema.schema,
        },
      };
    } else if (mode === "text") {
      body.response_format = { type: "text" };
    }

    return {
      url: joinUrl(baseUrl, "/v1/chat/completions"),
      headers: buildHeaders({ apiKey: null, provider: "ollama" }),
      body,
    };
  },
  extractText: (response) => {
    const content = getNestedValue(response, [
      "choices",
      0,
      "message",
      "content",
    ]);
    return typeof content === "string" ? content : null;
  },
  isCapabilityError: ({ mode, status, body }) =>
    isCapabilityError({ mode, status, body }),
  getValidationUrls: ({ baseUrl }) => [
    joinUrl(baseUrl, "/v1/models"),
    joinUrl(baseUrl, "/api/tags"),
  ],
};
