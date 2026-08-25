import { createProviderStrategy } from "./factory";

export const claudeCliStrategy = createProviderStrategy({
  provider: "claude_cli",
  defaultBaseUrl: "",
  requiresApiKey: false,
  modes: ["none"],
  validationPaths: [],
  buildRequest: () => {
    throw new Error("Claude CLI provider does not use HTTP requests.");
  },
  extractText: () => null,
  getValidationUrls: () => [],
});
