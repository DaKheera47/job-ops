import type { LlmRequestOptions, ResponseMode } from "../types";
import { buildHeaders, joinUrl } from "../utils/http";
import { getNestedValue } from "../utils/object";
import { createProviderStrategy } from "./factory";

export const anthropicStrategy = createProviderStrategy({
  provider: "anthropic",
  defaultBaseUrl: "https://api.anthropic.com",
  requiresApiKey: true,
  modes: ["json_object", "none"],
  validationPaths: ["/v1/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    // Anthropic uses a different message format than OpenAI.
    // System messages must be extracted and sent as a top-level `system` field.
    const systemMessages = messages.filter((m) => m.role === "system");
    const nonSystemMessages = messages.filter((m) => m.role !== "system");

    const systemPrompt = systemMessages.map((m) => m.content).join("\n\n");

    // Ensure JSON instruction is present for json_object mode
    const inputMessages =
      mode === "json_object"
        ? ensureJsonInstruction(nonSystemMessages)
        : nonSystemMessages;

    const body: Record<string, unknown> = {
      model,
      max_tokens: 4096,
      messages: inputMessages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    return {
      url: joinUrl(baseUrl, "/v1/messages"),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey || "",
        "anthropic-version": "2023-06-01",
      },
      body,
    };
  },
  extractText: (response) => {
    // Anthropic response: { content: [{ type: "text", text: "..." }] }
    const content = getNestedValue(response, ["content"]);
    if (!Array.isArray(content)) return null;

    for (const block of content) {
      const type = getNestedValue(block, ["type"]);
      const text = getNestedValue(block, ["text"]);
      if (type === "text" && typeof text === "string") {
        return text;
      }
    }
    return null;
  },
  getValidationUrls: ({ baseUrl, apiKey }) => [
    joinUrl(baseUrl, "/v1/models"),
  ],
});

function ensureJsonInstruction(
  messages: LlmRequestOptions<unknown>["messages"],
): LlmRequestOptions<unknown>["messages"] {
  const hasJson = messages.some((m) =>
    m.content.toLowerCase().includes("json"),
  );
  if (hasJson) return messages;
  return [
    {
      role: "user" as const,
      content: "Respond with valid JSON.",
    },
    ...messages,
  ];
}
