import type { LlmRequestOptions, ResponseMode } from "../types";
import { joinUrl } from "../utils/http";
import { getNestedValue } from "../utils/object";
import { createProviderStrategy } from "./factory";

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 8192;

export const anthropicStrategy = createProviderStrategy({
  provider: "anthropic",
  defaultBaseUrl: "https://api.anthropic.com",
  requiresApiKey: true,
  modes: ["json_object", "text", "none"],
  validationPaths: ["/v1/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    const { system, conversationMessages } = toAnthropicMessages(
      messages,
      mode,
      jsonSchema,
    );

    const body: Record<string, unknown> = {
      model,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: conversationMessages,
    };

    if (system) {
      body.system = system;
    }

    return {
      url: joinUrl(baseUrl, "/v1/messages"),
      headers: buildAnthropicHeaders(apiKey),
      body,
    };
  },
  extractText: (response) => {
    const content = getNestedValue(response, ["content"]);
    if (!Array.isArray(content)) return null;

    const text = content
      .filter(
        (block) => getNestedValue(block, ["type"]) === "text",
      )
      .map((block) => getNestedValue(block, ["text"]))
      .filter((part): part is string => typeof part === "string")
      .join("");

    return text || null;
  },
  getValidationUrls: ({ baseUrl, apiKey }) => {
    // Anthropic /v1/models requires x-api-key, which is sent via headers.
    return [joinUrl(baseUrl, "/v1/models")];
  },
});

function buildAnthropicHeaders(
  apiKey: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "anthropic-version": ANTHROPIC_VERSION,
  };

  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  return headers;
}

function toAnthropicMessages(
  messages: LlmRequestOptions<unknown>["messages"],
  mode: ResponseMode,
  jsonSchema: { name: string; schema: Record<string, unknown> },
): {
  system: string | null;
  conversationMessages: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
} {
  const systemParts: string[] = [];

  const conversationMessages = messages
    .filter((message) => {
      if (message.role === "system") {
        systemParts.push(message.content);
        return false;
      }
      return true;
    })
    .map((message) => ({
      role: message.role as "user" | "assistant",
      content: message.content,
    }));

  if (mode === "json_object") {
    const schemaInstruction = buildJsonInstruction(jsonSchema);
    systemParts.push(schemaInstruction);
  }

  const system = systemParts.length ? systemParts.join("\n\n") : null;

  return { system, conversationMessages };
}

function buildJsonInstruction(jsonSchema: {
  name: string;
  schema: Record<string, unknown>;
}): string {
  return [
    "IMPORTANT: You MUST respond with valid JSON only — no markdown, no code fences, no extra text.",
    `Your response must conform to this JSON schema (name: "${jsonSchema.name}"):`,
    JSON.stringify(jsonSchema.schema, null, 2),
  ].join("\n");
}
