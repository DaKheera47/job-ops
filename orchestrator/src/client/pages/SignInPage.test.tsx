import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignInPage } from "./SignInPage";

vi.mock("@client/api", () => ({
  getAppStatus: vi.fn(async () => ({
    appMode: "local",
    capabilities: {
      hostedSignups: false,
      platformLlm: false,
      quotas: false,
      userEditableLlmSettings: true,
    },
    hostedTenantConfigured: false,
  })),
  getAuthBootstrapStatus: vi.fn(async () => ({
    setupRequired: false,
  })),
  getSsoProviders: vi.fn(async () => []),
  hasAuthenticatedSession: vi.fn(() => false),
  restoreAuthSessionFromLegacyCredentials: vi.fn(async () => false),
  signupWithCredentials: vi.fn(async () => ({
    id: "user-1",
    username: "admin",
    displayName: null,
    isSystemAdmin: true,
    isDisabled: false,
    hasPassword: true,
    workspaceId: "tenant_default",
    workspaceName: "JobOps",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  signInWithCredentials: vi.fn(async () => undefined),
  startSsoLogin: vi.fn(),
}));

import {
  getAppStatus,
  getAuthBootstrapStatus,
  getSsoProviders,
  hasAuthenticatedSession,
  restoreAuthSessionFromLegacyCredentials,
  signInWithCredentials,
  signupWithCredentials,
  startSsoLogin,
} from "@client/api";

const localAppStatus = {
  appMode: "local" as const,
  capabilities: {
    hostedSignups: false,
    platformLlm: false,
    quotas: false,
    userEditableLlmSettings: true,
  },
  hostedTenantConfigured: false,
};

const hostedSignupAppStatus = {
  appMode: "hosted" as const,
  capabilities: {
    hostedSignups: true,
    platformLlm: false,
    quotas: false,
    userEditableLlmSettings: true,
  },
  hostedTenantConfigured: true,
};

const hostedSignupDisabledAppStatus = {
  ...hostedSignupAppStatus,
  capabilities: {
    ...hostedSignupAppStatus.capabilities,
    hostedSignups: false,
  },
};

const realLocation = window.location;

function renderSignInPage(
  initialEntries: string[],
  extraRoutes?: React.ReactNode,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/sign-in" element={<SignInPage />} />
          {extraRoutes}
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SignInPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    vi.mocked(getAppStatus).mockResolvedValue(localAppStatus);
    vi.mocked(getAuthBootstrapStatus).mockResolvedValue({
      setupRequired: false,
    });
    vi.mocked(getSsoProviders).mockResolvedValue([]);
    vi.mocked(hasAuthenticatedSession).mockReturnValue(false);
    vi.mocked(restoreAuthSessionFromLegacyCredentials).mockResolvedValue(false);
    const authUser = {
      id: "user-1",
      username: "admin",
      displayName: null,
      isSystemAdmin: true,
      isDisabled: false,
      hasPassword: true,
      workspaceId: "tenant_default",
      workspaceName: "JobOps",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    vi.mocked(signupWithCredentials).mockResolvedValue(authUser);
    vi.mocked(signInWithCredentials).mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("signs in and returns to the requested next route", async () => {
    renderSignInPage(
      ["/sign-in?next=%2Fjobs%2Fready"],
      <Route path="/jobs/ready" element={<div>ready-page</div>} />,
    );

    await waitFor(() => {
      expect(restoreAuthSessionFromLegacyCredentials).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(signInWithCredentials).toHaveBeenCalledWith("admin", "secret");
      expect(screen.getByText("ready-page")).toBeInTheDocument();
    });
  });

  it("prefills a remembered username but still requires a password", async () => {
    localStorage.setItem(
      "jobops.rememberedAuthUsers",
      JSON.stringify([
        {
          username: "remembered-admin",
          displayName: null,
          rememberedAt: Date.now(),
        },
      ]),
    );

    renderSignInPage(["/sign-in?user=remembered-admin"]);

    await waitFor(() => {
      expect(restoreAuthSessionFromLegacyCredentials).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByLabelText("Username")).toHaveValue("remembered-admin");
    expect(screen.getByLabelText("Password")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter both username and password.",
    );
    expect(signInWithCredentials).not.toHaveBeenCalled();
  });

  it("sends first-run setup into onboarding", async () => {
    vi.mocked(getAuthBootstrapStatus).mockResolvedValueOnce({
      setupRequired: true,
    });

    renderSignInPage(
      ["/sign-in"],
      <Route path="/onboarding" element={<div>onboarding</div>} />,
    );

    expect(await screen.findByText("onboarding")).toBeInTheDocument();
    expect(signupWithCredentials).not.toHaveBeenCalled();
  });

  it("shows hosted signup tabs only when enabled by app status", async () => {
    vi.mocked(getAppStatus).mockResolvedValueOnce(hostedSignupAppStatus);

    renderSignInPage(["/sign-in"]);

    expect(
      await screen.findByRole("tab", { name: "Create account" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sign in" })).toBeInTheDocument();
  });

  it("hides hosted signup when hosted signups are disabled", async () => {
    vi.mocked(getAppStatus).mockResolvedValueOnce(
      hostedSignupDisabledAppStatus,
    );

    renderSignInPage(["/sign-in"]);

    await waitFor(() => {
      expect(restoreAuthSessionFromLegacyCredentials).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole("tab", { name: "Create account" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("creates a hosted signup account and returns to the requested next route", async () => {
    vi.mocked(getAppStatus).mockResolvedValueOnce(hostedSignupAppStatus);
    vi.mocked(signupWithCredentials).mockResolvedValueOnce({
      id: "user-2",
      username: "new-user",
      displayName: "New User",
      isSystemAdmin: false,
      isDisabled: false,
      hasPassword: true,
      workspaceId: "tenant_hosted",
      workspaceName: "JobOps",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    renderSignInPage(
      ["/sign-in?next=%2Fjobs%2Fall"],
      <Route path="/jobs/all" element={<div>all-jobs-page</div>} />,
    );

    const signupTab = await screen.findByRole("tab", {
      name: "Create account",
    });
    fireEvent.pointerDown(signupTab);
    fireEvent.click(signupTab);
    await screen.findByLabelText("Name");
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "New User" },
    });
    fireEvent.change(screen.getByLabelText("Username"), {
      target: { value: " new-user " },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "super-secret" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(signupWithCredentials).toHaveBeenCalledWith({
        username: "new-user",
        password: "super-secret",
        displayName: "New User",
      });
      expect(screen.getByText("all-jobs-page")).toBeInTheDocument();
    });
    expect(localStorage.getItem("jobops.rememberedAuthUsers")).toContain(
      "new-user",
    );
  });

  it("hides the single sign-on divider when no provider is configured", async () => {
    renderSignInPage(["/sign-in"]);

    await waitFor(() => {
      expect(getSsoProviders).toHaveBeenCalled();
    });

    expect(screen.queryByText("or continue with")).toBeNull();
  });

  it("starts a provider login and hands the browser to the identity provider", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, assign },
    });
    vi.mocked(getSsoProviders).mockResolvedValue([
      { id: "google", displayName: "Google" },
      { id: "oidc", displayName: "Pocket ID" },
    ]);
    vi.mocked(startSsoLogin).mockResolvedValue({
      provider: "google",
      authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?x=1",
      state: "state-1",
      flowToken: "flow-token-1",
    });

    renderSignInPage(["/sign-in?next=%2Fjobs%2Fall"]);

    const googleButton = await screen.findByRole("button", {
      name: "Continue with Google",
    });
    expect(
      screen.getByRole("button", { name: "Continue with Pocket ID" }),
    ).toBeInTheDocument();
    await waitFor(() => expect(googleButton).toBeEnabled());

    fireEvent.click(googleButton);

    await waitFor(() => {
      expect(startSsoLogin).toHaveBeenCalledWith("google");
      expect(assign).toHaveBeenCalledWith(
        "https://accounts.google.com/o/oauth2/v2/auth?x=1",
      );
    });
    expect(
      JSON.parse(sessionStorage.getItem("jobops.ssoFlow") ?? "null"),
    ).toMatchObject({
      provider: "google",
      state: "state-1",
      flowToken: "flow-token-1",
      mode: "login",
      next: "/jobs/all",
    });
  });

  it("reports a failed provider start without leaving the page", async () => {
    vi.mocked(getSsoProviders).mockResolvedValue([
      { id: "github", displayName: "GitHub" },
    ]);
    vi.mocked(startSsoLogin).mockRejectedValue(
      new Error("Single sign-on is disabled in the public demo."),
    );

    renderSignInPage(["/sign-in"]);

    const githubButton = await screen.findByRole("button", {
      name: "Continue with GitHub",
    });
    await waitFor(() => expect(githubButton).toBeEnabled());

    fireEvent.click(githubButton);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Single sign-on is disabled in the public demo.",
    );
    expect(sessionStorage.getItem("jobops.ssoFlow")).toBeNull();
  });
});
