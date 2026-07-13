import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CodexAuthPanel } from "./CodexAuthPanel";

describe("CodexAuthPanel", () => {
  it("lets an existing runtime sign-in be disconnected", async () => {
    const disconnect = vi.fn().mockResolvedValue({
      authenticated: false,
      username: null,
      validationMessage: "Codex is not authenticated.",
      flowStatus: "idle",
      loginInProgress: false,
      verificationUrl: null,
      userCode: null,
      startedAt: null,
      expiresAt: null,
      flowMessage: null,
    });
    const getStatus = vi.fn().mockResolvedValue({
      authenticated: true,
      username: "dev@example.com",
      validationMessage: null,
      flowStatus: "idle",
      loginInProgress: false,
      verificationUrl: null,
      userCode: null,
      startedAt: null,
      expiresAt: null,
      flowMessage: null,
    });

    render(
      <CodexAuthPanel
        isBusy={false}
        authApi={{
          disconnect,
          getStatus,
          start: vi.fn(),
        }}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Disconnect" }));
    await waitFor(() => expect(disconnect).toHaveBeenCalledOnce());
    expect(await screen.findByText("Codex Sign-In")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start sign-in/i }),
    ).toBeInTheDocument();
  });
});
