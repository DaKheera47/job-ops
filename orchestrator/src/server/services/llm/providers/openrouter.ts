import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

export const openRouterStrategy = createProviderStrategy({
  provider: "openrouter",
  defaultBaseUrl: "https://openrouter.ai",
  requiresApiKey: true,
  modes: ["json_schema", "none"],
  validationPaths: ["/api/v1/key"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    return {
      url: joinUrl(baseUrl, "/api/v1/chat/completions"),
      headers: buildHeaders({ apiKey, provider: "openrouter" }),
      body: buildChatCompletionsBody({
        mode,
        model,
        messages,
        jsonSchema,
        extra: { plugins: [{ id: "response-healing" }] },
      }),
    };
  },
  extractText: extractChatCompletionsText,
});
