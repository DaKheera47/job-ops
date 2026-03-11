import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

const CHAT_COMPLETIONS_SUFFIX = "/v1/chat/completions";
const MODELS_SUFFIX = "/v1/models";
const API_VERSION_SUFFIX = "/v1";

function normalizeBaseUrlOrEndpoint(baseUrlOrEndpoint: string): string {
  return baseUrlOrEndpoint.trim().replace(/\/+$/, "");
}

function appendVersionedPath(baseUrl: string, path: string): string {
  if (baseUrl.endsWith(API_VERSION_SUFFIX)) {
    return joinUrl(baseUrl.slice(0, -API_VERSION_SUFFIX.length), path);
  }
  return joinUrl(baseUrl, path);
}

function resolveChatCompletionsUrl(baseUrlOrEndpoint: string): string {
  const normalized = normalizeBaseUrlOrEndpoint(baseUrlOrEndpoint);
  if (
    normalized.endsWith(CHAT_COMPLETIONS_SUFFIX) ||
    normalized.endsWith("/chat/completions")
  ) {
    return normalized;
  }
  return appendVersionedPath(normalized, CHAT_COMPLETIONS_SUFFIX);
}

function resolveModelsUrl(baseUrlOrEndpoint: string): string {
  const normalized = normalizeBaseUrlOrEndpoint(baseUrlOrEndpoint);
  if (normalized.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
    return `${normalized.slice(0, -"/chat/completions".length)}/models`;
  }
  if (normalized.endsWith("/chat/completions")) {
    return normalized.replace(/\/chat\/completions$/, "/models");
  }
  return appendVersionedPath(normalized, MODELS_SUFFIX);
}

export const openAiCompatibleStrategy = createProviderStrategy({
  provider: "openai_compatible",
  defaultBaseUrl: "https://api.openai.com",
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "text", "none"],
  validationPaths: ["/v1/models"],
  getValidationUrls: ({ baseUrl }) => [resolveModelsUrl(baseUrl)],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    return {
      url: resolveChatCompletionsUrl(baseUrl),
      headers: buildHeaders({ apiKey, provider: "openai_compatible" }),
      body: buildChatCompletionsBody({ mode, model, messages, jsonSchema }),
    };
  },
  extractText: extractChatCompletionsText,
});
