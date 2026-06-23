import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LlmConnectionStep } from "./LlmConnectionStep";

vi.mock("@client/api", () => ({
  disconnectCodexAuth: vi.fn(),
  getCodexAuthStatus: vi.fn().mockResolvedValue({
    authenticated: false,
    username: null,
    validationMessage: null,
    flowStatus: "idle",
    loginInProgress: false,
    verificationUrl: null,
    userCode: null,
    startedAt: null,
    expiresAt: null,
    flowMessage: null,
  }),
  getLlmModels: vi.fn().mockResolvedValue([]),
  startCodexAuth: vi.fn(),
}));

const noop = vi.fn();

describe("LlmConnectionStep", () => {
  it("hides stale API key errors for Ollama", () => {
    render(
      <LlmConnectionStep
        apiKey=""
        baseUrl=""
        defaultModel="google/gemini-3-flash-preview"
        effectiveModel="google/gemini-3-flash-preview"
        isBusy={false}
        llmKeyHint={null}
        model=""
        savedBaseUrl={null}
        savedProvider="openrouter"
        selectedProvider="ollama"
        validation={{
          valid: false,
          message: "LLM API key is missing.",
          status: null,
          checked: true,
          hydrated: true,
        }}
        onApiKeyChange={noop}
        onBaseUrlChange={noop}
        onModelChange={noop}
        onProviderChange={noop}
      />,
    );

    expect(screen.getByLabelText("API key (optional)")).toBeInTheDocument();
    expect(
      screen.queryByText("LLM API key is missing."),
    ).not.toBeInTheDocument();
  });
});
