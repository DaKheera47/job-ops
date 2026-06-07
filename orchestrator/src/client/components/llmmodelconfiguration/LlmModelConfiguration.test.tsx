import { render, screen } from "@testing-library/react";
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
  });
});
