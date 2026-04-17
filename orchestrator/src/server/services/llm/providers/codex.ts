import { createProviderStrategy } from "./factory";

export const codexStrategy = createProviderStrategy({
  provider: "codex",
  defaultBaseUrl: "",
  requiresApiKey: false,
  modes: ["none"],
  validationPaths: [],
  buildRequest: () => {
    throw new Error("Codex provider does not use HTTP requests.");
  },
  extractText: () => null,
  getValidationUrls: () => [],
});
