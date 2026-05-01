import { createProviderStrategy } from "./factory";

export const geminiCliStrategy = createProviderStrategy({
  provider: "gemini_cli",
  defaultBaseUrl: "",
  requiresApiKey: false,
  modes: ["none"],
  validationPaths: [],
  buildRequest: () => {
    throw new Error("Gemini CLI provider does not use HTTP requests.");
  },
  extractText: () => null,
  getValidationUrls: () => [],
});
