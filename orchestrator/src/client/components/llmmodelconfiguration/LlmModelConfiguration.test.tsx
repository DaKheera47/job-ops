import { render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LlmModelConfiguration } from "./LlmModelConfiguration";

vi.mock("@client/api", () => ({
  disconnectCodexAuth: vi.fn(),
  getCodexAuthStatus: vi.fn().mockResolvedValue({
    authenticated: false,
    username: null,
    validationMessage:
      "Codex is not authenticated in this container. Run `codex login` and try again.",
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

const textField = {
  value: "",
  onChange: vi.fn(),
};

describe("LlmModelConfiguration", () => {
  it("does not render an LLM API key affordance for Codex in compact mode", async () => {
    render(
      <LlmModelConfiguration
        mode="compact"
        disabled={false}
        selectedProvider="codex"
        provider={textField}
        baseUrl={textField}
        apiKey={textField}
        model={textField}
      />,
    );

    expect(screen.getByText("Codex Sign-In")).toBeInTheDocument();
    expect(screen.queryByLabelText(/api key/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText("No API key is required for this provider."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "find out what model name to use" }),
    ).toHaveAttribute("href", "https://developers.openai.com/codex/models");
  });

  it("asks Ollama users to choose an installed model instead of using a default", async () => {
    render(
      <LlmModelConfiguration
        mode="compact"
        disabled={false}
        selectedProvider="ollama"
        provider={textField}
        baseUrl={textField}
        apiKey={textField}
        model={textField}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(
          "No Ollama models were returned. Pull a model in Ollama, then choose it here before continuing.",
        ),
      ).toBeInTheDocument();
    });
    expect(screen.getByText("Current:")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
  });
});
