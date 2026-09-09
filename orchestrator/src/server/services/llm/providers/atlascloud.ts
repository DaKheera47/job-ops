import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

export const ATLAS_CLOUD_BASE_URL = "https://api.atlascloud.ai";

export const atlasCloudStrategy = createProviderStrategy({
  provider: "atlascloud",
  defaultBaseUrl: ATLAS_CLOUD_BASE_URL,
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "text", "none"],
  validationPaths: ["/api/v1/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => ({
    url: joinUrl(baseUrl, "/v1/chat/completions"),
    headers: buildHeaders({ apiKey, provider: "atlascloud" }),
    body: buildChatCompletionsBody({ mode, model, messages, jsonSchema }),
  }),
  extractText: extractChatCompletionsText,
});
