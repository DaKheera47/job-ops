import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

export const ollamaStrategy = createProviderStrategy({
  provider: "ollama",
  defaultBaseUrl: "http://localhost:11434",
  requiresApiKey: false,
  modes: ["json_schema", "text", "none"],
  validationPaths: ["/v1/models", "/api/tags"],
  buildRequest: ({ mode, baseUrl, model, messages, jsonSchema }) => {
    return {
      url: joinUrl(baseUrl, "/v1/chat/completions"),
      headers: buildHeaders({ apiKey: null, provider: "ollama" }),
      body: buildChatCompletionsBody({ mode, model, messages, jsonSchema }),
    };
  },
  extractText: extractChatCompletionsText,
});
