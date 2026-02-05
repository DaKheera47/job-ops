import type { LlmRequestOptions } from "../types";
import { addQueryParam, buildHeaders, joinUrl } from "../utils/http";
import { getNestedValue } from "../utils/object";
import { createProviderStrategy } from "./factory";

export const geminiStrategy = createProviderStrategy({
  provider: "gemini",
  defaultBaseUrl: "https://generativelanguage.googleapis.com",
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "none"],
  validationPaths: ["/v1beta/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    const { systemInstruction, contents } = toGeminiContents(messages);
    const body: Record<string, unknown> = {
      contents,
    };

    if (systemInstruction) {
      body.systemInstruction = systemInstruction;
    }

    if (mode === "json_schema") {
      body.generationConfig = {
        responseMimeType: "application/json",
        responseSchema: jsonSchema.schema,
      };
    } else if (mode === "json_object") {
      body.generationConfig = {
        responseMimeType: "application/json",
      };
    }

    const url = joinUrl(
      baseUrl,
      `/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    );
    const urlWithKey = addQueryParam(url, "key", apiKey ?? "");

    return {
      url: urlWithKey,
      headers: buildHeaders({ apiKey: null, provider: "gemini" }),
      body,
    };
  },
  extractText: (response) => {
    const parts = getNestedValue(response, [
      "candidates",
      0,
      "content",
      "parts",
    ]);
    if (!Array.isArray(parts)) return null;
    const text = parts
      .map((part) => getNestedValue(part, ["text"]))
      .filter((part) => typeof part === "string")
      .join("");
    return text || null;
  },
  getValidationUrls: ({ baseUrl, apiKey }) => {
    const url = joinUrl(baseUrl, "/v1beta/models");
    return [addQueryParam(url, "key", apiKey ?? "")];
  },
});

function toGeminiContents(messages: LlmRequestOptions<unknown>["messages"]): {
  systemInstruction: { parts: Array<{ text: string }> } | null;
  contents: Array<{ role: "user" | "model"; parts: Array<{ text: string }> }>;
} {
  const systemParts: string[] = [];
  const contents = messages
    .filter((message) => {
      if (message.role === "system") {
        systemParts.push(message.content);
        return false;
      }
      return true;
    })
    .map((message) => {
      const role: "user" | "model" =
        message.role === "assistant" ? "model" : "user";
      return { role, parts: [{ text: message.content }] };
    });

  const systemInstruction = systemParts.length
    ? { parts: [{ text: systemParts.join("\n") }] }
    : null;

  return { systemInstruction, contents };
}
