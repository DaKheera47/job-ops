import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingSsoFlow } from "../lib/sso-flow";
import { SsoCallbackPage } from "./SsoCallbackPage";

vi.mock("@client/api", () => ({
  completeSsoLink: vi.fn(),
  completeSsoLogin: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/analytics", () => ({
  trackProductEvent: vi.fn(),
}));

import { completeSsoLink, completeSsoLogin } from "@client/api";
import { trackProductEvent } from "@/lib/analytics";

const authUser = {
  id: "user-1",
  username: "sadia",
  displayName: "Sadia",
  isSystemAdmin: false,
  isDisabled: false,
  hasPassword: false,
  workspaceId: "tenant_default",
  workspaceName: "JobOps",
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
};

function storeFlow(overrides: Partial<PendingSsoFlow> = {}): void {
  sessionStorage.setItem(
    "jobops.ssoFlow",
    JSON.stringify({
      provider: "google",
      state: "state-1",
      flowToken: "flow-token-1",
      mode: "login",
      next: "/jobs/all",
      startedAt: Date.now(),
      ...overrides,
    } satisfies PendingSsoFlow),
  );
}

function renderCallback(search: string) {
  window.history.replaceState(null, "", `/sso/callback/google${search}`);

  return render(
    <MemoryRouter initialEntries={["/sso/callback/google"]}>
      <Routes>
        <Route path="/sso/callback/:provider" element={<SsoCallbackPage />} />
        <Route path="/jobs/all" element={<div>all-jobs-page</div>} />
        <Route path="/jobs/ready" element={<div>ready-page</div>} />
        <Route path="/settings" element={<div>settings-page</div>} />
        <Route path="/sign-in" element={<div>sign-in-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SsoCallbackPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    vi.mocked(completeSsoLogin).mockResolvedValue({
      token: "token-1",
      expiresIn: 3600,
      user: authUser,
      created: true,
    });
    vi.mocked(completeSsoLink).mockResolvedValue({
      id: "identity-1",
      provider: "google",
      email: "sadia@example.com",
      displayName: "Sadia",
      createdAt: "2026-05-20T00:00:00.000Z",
    });
  });

  it("strips the authorization code from the URL before completing the login", async () => {
    storeFlow();

    renderCallback("?code=secret-code&state=state-1");

    expect(window.location.search).toBe("");
    await waitFor(() => {
      expect(completeSsoLogin).toHaveBeenCalledWith("google", {
        state: "state-1",
        flowToken: "flow-token-1",
        callbackSearch: "?code=secret-code&state=state-1",
      });
      expect(screen.getByText("all-jobs-page")).toBeInTheDocument();
    });
    expect(trackProductEvent).toHaveBeenCalledWith("sso_login_completed", {
      provider: "google",
      created: true,
    });
    expect(sessionStorage.getItem("jobops.ssoFlow")).toBeNull();
  });

  it("refuses an off-site next path", async () => {
    storeFlow({ next: "//evil.com" });

    renderCallback("?code=secret-code&state=state-1");

    await waitFor(() => {
      expect(screen.getByText("ready-page")).toBeInTheDocument();
    });
  });

  it("rejects a callback whose state does not match the stored flow", async () => {
    storeFlow();

    renderCallback("?code=secret-code&state=state-2");

    expect(
      await screen.findByText("This sign-in link is no longer valid."),
    ).toBeInTheDocument();
    expect(completeSsoLogin).not.toHaveBeenCalled();
    expect(
      screen.getByRole("link", { name: "Back to sign in" }),
    ).toHaveAttribute("href", "/sign-in");
  });

  it("rejects a callback with no stored flow", async () => {
    renderCallback("?code=secret-code&state=state-1");

    expect(
      await screen.findByText("This sign-in link is no longer valid."),
    ).toBeInTheDocument();
    expect(completeSsoLogin).not.toHaveBeenCalled();
  });

  it("reports a provider error without echoing its text or burning the flow", async () => {
    storeFlow();

    renderCallback(
      "?error=access_denied&error_description=Call+555+0100+to+unlock",
    );

    expect(
      await screen.findByText(/Your identity provider refused the sign-in/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Call 555 0100/)).not.toBeInTheDocument();
    expect(completeSsoLogin).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("jobops.ssoFlow")).not.toBeNull();
  });

  it("finishes a link flow and returns to settings", async () => {
    storeFlow({ mode: "link", next: null });

    renderCallback("?code=secret-code&state=state-1");

    await waitFor(() => {
      expect(completeSsoLink).toHaveBeenCalledWith("google", {
        state: "state-1",
        flowToken: "flow-token-1",
        callbackSearch: "?code=secret-code&state=state-1",
      });
      expect(screen.getByText("settings-page")).toBeInTheDocument();
    });
    expect(trackProductEvent).toHaveBeenCalledWith("sso_link_completed", {
      provider: "google",
    });
  });

  it("shows the server's message when the exchange fails", async () => {
    storeFlow();
    vi.mocked(completeSsoLogin).mockRejectedValue(
      new Error("SSO session expired, try again"),
    );

    renderCallback("?code=secret-code&state=state-1");

    expect(
      await screen.findByText("SSO session expired, try again"),
    ).toBeInTheDocument();
  });
});
