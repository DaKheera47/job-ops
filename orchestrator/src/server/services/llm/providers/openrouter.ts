import { isCapabilityError } from "../policies/capability-fallback";
import type { ProviderStrategy } from "../types";
import { buildHeaders, joinUrl } from "../utils/http";
import { getNestedValue } from "../utils/object";

export const openRouterStrategy: ProviderStrategy = {
  provider: "openrouter",
  defaultBaseUrl: "https://openrouter.ai",
  requiresApiKey: true,
  modes: ["json_schema", "none"],
  validationPaths: ["/api/v1/key"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    const body: Record<string, unknown> = {
      model,
      messages,
      stream: false,
      plugins: [{ id: "response-healing" }],
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
    }

    return {
      url: joinUrl(baseUrl, "/api/v1/chat/completions"),
      headers: buildHeaders({ apiKey, provider: "openrouter" }),
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
  getValidationUrls: ({ baseUrl }) => [joinUrl(baseUrl, "/api/v1/key")],
};
