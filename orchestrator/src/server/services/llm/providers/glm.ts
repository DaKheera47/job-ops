import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

const CHAT_COMPLETIONS_SUFFIX = "/chat/completions";
const MODELS_SUFFIX = "/models";

function normalizeBaseUrlOrEndpoint(baseUrlOrEndpoint: string): string {
  return baseUrlOrEndpoint.trim().replace(/\/+$/, "");
}

function resolveChatCompletionsUrl(baseUrlOrEndpoint: string): string {
  const normalized = normalizeBaseUrlOrEndpoint(baseUrlOrEndpoint);
  if (normalized.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
    return normalized;
  }
  return joinUrl(normalized, CHAT_COMPLETIONS_SUFFIX);
}

function resolveModelsUrl(baseUrlOrEndpoint: string): string {
  const normalized = normalizeBaseUrlOrEndpoint(baseUrlOrEndpoint);
  if (normalized.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
    return `${normalized.slice(0, -CHAT_COMPLETIONS_SUFFIX.length)}${MODELS_SUFFIX}`;
  }
  return joinUrl(normalized, MODELS_SUFFIX);
}

export const glmStrategy = createProviderStrategy({
  provider: "glm",
  defaultBaseUrl: "https://api.z.ai/api/paas/v4",
  requiresApiKey: true,
  modes: ["json_object", "text", "none"],
  validationPaths: ["/models"],
  getValidationUrls: ({ baseUrl }) => [resolveModelsUrl(baseUrl)],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    return {
      url: resolveChatCompletionsUrl(baseUrl),
      headers: buildHeaders({ apiKey, provider: "glm" }),
      body: buildChatCompletionsBody({ mode, model, messages, jsonSchema }),
    };
  },
  extractText: extractChatCompletionsText,
});
