import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

export const runcrateStrategy = createProviderStrategy({
  provider: "runcrate",
  defaultBaseUrl: "https://api.runcrate.ai/v1",
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "text", "none"],
  validationPaths: ["/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => ({
    url: joinUrl(baseUrl, "/chat/completions"),
    headers: buildHeaders({ apiKey, provider: "runcrate" }),
    body: buildChatCompletionsBody({ mode, model, messages, jsonSchema }),
  }),
  extractText: extractChatCompletionsText,
});
