import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

export const uberLlmStrategy = createProviderStrategy({
  provider: "uberllm",
  defaultBaseUrl: "https://api.uberllm.dev/v1",
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "text", "none"],
  validationPaths: ["/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => ({
    url: joinUrl(baseUrl, "/chat/completions"),
    headers: buildHeaders({ apiKey, provider: "uberllm" }),
    body: buildChatCompletionsBody({ mode, model, messages, jsonSchema }),
  }),
  extractText: extractChatCompletionsText,
});
