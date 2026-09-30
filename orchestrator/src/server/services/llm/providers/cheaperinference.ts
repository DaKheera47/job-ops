import { buildHeaders, joinUrl } from "../utils/http";
import {
  buildChatCompletionsBody,
  createProviderStrategy,
  extractChatCompletionsText,
} from "./factory";

export const CHEAPER_INFERENCE_BASE_URL = "https://api.cheaperinference.com/v1";

export const cheaperInferenceStrategy = createProviderStrategy({
  provider: "cheaperinference",
  defaultBaseUrl: CHEAPER_INFERENCE_BASE_URL,
  requiresApiKey: true,
  modes: ["json_schema", "json_object", "text", "none"],
  validationPaths: ["/models"],
  buildRequest: ({ mode, baseUrl, apiKey, model, messages, jsonSchema }) => ({
    url: joinUrl(baseUrl, "/chat/completions"),
    headers: buildHeaders({ apiKey, provider: "cheaperinference" }),
    body: buildChatCompletionsBody({ mode, model, messages, jsonSchema }),
  }),
  extractText: extractChatCompletionsText,
});
