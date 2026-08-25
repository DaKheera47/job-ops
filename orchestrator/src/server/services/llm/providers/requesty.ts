import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

export const requestyStrategy = createProviderStrategy({
  provider: "requesty",
  defaultBaseUrl: "https://router.requesty.ai/v1",
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "text", "none"],
  validationPaths: ["/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => {
    return {
      url: joinUrl(baseUrl, "/chat/completions"),
      headers: buildHeaders({ apiKey, provider: "requesty" }),
      body: buildChatCompletionsBody({ mode, model, messages, jsonSchema }),
    };
  },
  extractText: extractChatCompletionsText,
});
