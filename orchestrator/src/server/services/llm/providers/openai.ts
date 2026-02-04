import type { LlmRequestOptions, ResponseMode } from "../types";
import { buildHeaders, joinUrl } from "../utils/http";
import { getNestedValue } from "../utils/object";
import { createProviderStrategy } from "./factory";

export const openAiStrategy = createProviderStrategy({
  provider: "openai",
  defaultBaseUrl: "https://api.openai.com",
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "none"],
  validationPaths: ["/v1/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    const input = ensureJsonInstructionIfNeeded(messages, mode);
    const body: Record<string, unknown> = {
      model,
      input,
    };

    if (mode === "json_schema") {
      body.text = {
        format: {
          type: "json_schema",
          name: jsonSchema.name,
          strict: true,
          schema: jsonSchema.schema,
        },
      };
    } else if (mode === "json_object") {
      body.text = { format: { type: "json_object" } };
    }

    return {
      url: joinUrl(baseUrl, "/v1/responses"),
      headers: buildHeaders({ apiKey, provider: "openai" }),
      body,
    };
  },
  extractText: (response) => {
    const direct = getNestedValue(response, ["output_text"]);
    if (typeof direct === "string" && direct.trim()) return direct;

    const output = getNestedValue(response, ["output"]);
    if (!Array.isArray(output)) return null;

    for (const item of output) {
      const content = getNestedValue(item, ["content"]);
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        const type = getNestedValue(part, ["type"]);
        const text = getNestedValue(part, ["text"]);
        if (type === "output_text" && typeof text === "string") {
          return text;
        }
      }
    }
    return null;
  },
});

function ensureJsonInstructionIfNeeded(
  messages: LlmRequestOptions<unknown>["messages"],
  mode: ResponseMode,
) {
  if (mode !== "json_object") return messages;
  const hasJson = messages.some((message) =>
    message.content.toLowerCase().includes("json"),
  );
  if (hasJson) return messages;
  return [
    {
      role: "system" as const,
      content: "Respond with valid JSON.",
    },
    ...messages,
  ];
}
