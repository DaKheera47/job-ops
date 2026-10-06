import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

export const LITELLM_DEFAULT_BASE_URL = "http://localhost:4000";

const API_VERSION_SUFFIX = "/v1";

// Proxies are often configured with a trailing /v1 (the shape OpenAI SDKs
// expect); strip it so paths below are always rooted at the proxy itself.
export function normalizeLiteLlmBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  return trimmed.endsWith(API_VERSION_SUFFIX)
    ? trimmed.slice(0, -API_VERSION_SUFFIX.length)
    : trimmed;
}

export const liteLlmStrategy = createProviderStrategy({
  provider: "litellm",
  defaultBaseUrl: LITELLM_DEFAULT_BASE_URL,
  // Virtual keys are optional: a proxy started without a master key accepts
  // unauthenticated requests.
  requiresApiKey: false,
  modes: ["json_schema", "json_object", "text", "none"],
  validationPaths: ["/v1/models"],
  getValidationUrls: ({ baseUrl }) => [
    joinUrl(normalizeLiteLlmBaseUrl(baseUrl), "/v1/models"),
  ],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => ({
    url: joinUrl(normalizeLiteLlmBaseUrl(baseUrl), "/v1/chat/completions"),
    headers: buildHeaders({ apiKey, provider: "litellm" }),
    body: buildChatCompletionsBody({ mode, model, messages, jsonSchema }),
  }),
  extractText: extractChatCompletionsText,
});
