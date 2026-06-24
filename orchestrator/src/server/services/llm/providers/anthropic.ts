import type { LlmMessageContent, LlmRequestOptions } from "../types";
import { getLlmMessageText } from "../types";
import { buildHeaders, joinUrl } from "../utils/http";
import { getNestedValue } from "../utils/object";
import { createProviderStrategy } from "./factory";

const DEFAULT_MAX_TOKENS = 4096;

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: AnthropicImageSource;
    };

type AnthropicImageSource =
  | { type: "base64"; media_type: string; data: string }
  | { type: "url"; url: string };

export const anthropicStrategy = createProviderStrategy({
  provider: "anthropic",
  defaultBaseUrl: "https://api.anthropic.com",
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "none"],
  validationPaths: ["/v1/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    const { system, anthropicMessages } = toAnthropicMessages(messages);
    const body: Record<string, unknown> = {
      model,
      max_tokens: DEFAULT_MAX_TOKENS,
      messages: anthropicMessages,
    };

    if (system) {
      body.system = system;
    }

    if (mode === "json_schema") {
      body.output_config = {
        format: {
          type: "json_schema",
          schema: jsonSchema.schema,
        },
      };
    } else if (mode === "json_object") {
      body.output_config = {
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            additionalProperties: true,
          },
        },
      };
    }

    return {
      url: joinUrl(baseUrl, "/v1/messages"),
      headers: buildHeaders({ apiKey, provider: "anthropic" }),
      body,
    };
  },
  extractText: (response) => {
    const content = getNestedValue(response, ["content"]);
    if (!Array.isArray(content)) return null;

    const text = content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        const type = getNestedValue(part, ["type"]);
        const value = getNestedValue(part, ["text"]);
        return type === "text" && typeof value === "string" ? value : "";
      })
      .join("");

    return text || null;
  },
});

function toAnthropicMessages(
  messages: LlmRequestOptions<unknown>["messages"],
): {
  system: string | null;
  anthropicMessages: Array<{
    role: "user" | "assistant";
    content: string | AnthropicContentBlock[];
  }>;
} {
  const systemMessages: string[] = [];
  const anthropicMessages: Array<{
    role: "user" | "assistant";
    content: string | AnthropicContentBlock[];
  }> = [];

  for (const message of messages) {
    if (message.role === "system") {
      const text = getLlmMessageText(message.content).trim();
      if (text) systemMessages.push(text);
      continue;
    }

    anthropicMessages.push({
      role: message.role,
      content: toAnthropicContent(message.content),
    });
  }

  return {
    system: systemMessages.length > 0 ? systemMessages.join("\n\n") : null,
    anthropicMessages,
  };
}

function toAnthropicContent(
  content: LlmMessageContent,
): string | AnthropicContentBlock[] {
  if (typeof content === "string") return content;
  return content.map((part) => {
    if (part.type === "text") {
      return { type: "text", text: part.text };
    }

    return {
      type: "image",
      source: toAnthropicImageSource(part.imageUrl, part.mediaType),
    };
  });
}

function toAnthropicImageSource(
  imageUrl: string,
  fallbackMediaType: string,
): AnthropicImageSource {
  const match = imageUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) {
    return { type: "url", url: imageUrl };
  }

  return {
    type: "base64",
    media_type: match[1] || fallbackMediaType,
    data: match[2],
  };
}
