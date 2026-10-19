import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ConnectedAccountsApi,
  ConnectedAccountsSection,
} from "./ConnectedAccountsSection";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/client/lib/error-toast", () => ({
  showErrorToast: vi.fn(),
}));

import { showErrorToast } from "@/client/lib/error-toast";

const passwordUser = {
  id: "user-1",
  username: "sadia",
  displayName: "Sadia",
  isSystemAdmin: false,
  isDisabled: false,
  hasPassword: true,
  workspaceId: "tenant_default",
  workspaceName: "JobOps",
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
};

const googleIdentity = {
  id: "identity-1",
  provider: "google" as const,
  email: "sadia@example.com",
  displayName: "Sadia",
  createdAt: "2026-05-20T00:00:00.000Z",
};

const realLocation = window.location;

function createApi(
  overrides: Partial<ConnectedAccountsApi> = {},
): ConnectedAccountsApi {
  return {
    changeOwnPassword: vi.fn(async () => {}),
    getCurrentAuthUser: vi.fn(async () => passwordUser),
    getSsoProviders: vi.fn(async () => [
      { id: "google" as const, displayName: "Google" },
      { id: "github" as const, displayName: "GitHub" },
    ]),
    listSsoIdentities: vi.fn(async () => [googleIdentity]),
    startSsoLink: vi.fn(async () => ({
      provider: "github" as const,
      authorizationUrl: "https://github.com/login/oauth/authorize?x=1",
      state: "state-1",
      flowToken: "flow-token-1",
    })),
    unlinkSsoIdentity: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderSection(api: ConnectedAccountsApi) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ConnectedAccountsSection api={api} />
    </QueryClientProvider>,
  );
}

describe("ConnectedAccountsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: realLocation,
    });
  });

  it("lists linked identities and offers the remaining providers", async () => {
    renderSection(createApi());

    expect(await screen.findByText("Google")).toBeInTheDocument();
    expect(screen.getByText(/sadia@example\.com/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connect GitHub" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Connect Google" })).toBeNull();
  });

  it("unlinks a connected account after confirmation", async () => {
    const api = createApi();
    renderSection(api);

    fireEvent.click(await screen.findByRole("button", { name: "Unlink" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Unlink account" }),
    );

    await waitFor(() => {
      expect(api.unlinkSsoIdentity).toHaveBeenCalledWith("identity-1");
    });
  });

  it("reports an unlink the server refuses", async () => {
    const api = createApi({
      unlinkSsoIdentity: vi.fn(async () => {
        throw new Error(
          "Set a password before removing your last sign-in method",
        );
      }),
    });
    renderSection(api);

    fireEvent.click(await screen.findByRole("button", { name: "Unlink" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "Unlink account" }),
    );

    await waitFor(() => {
      expect(showErrorToast).toHaveBeenCalled();
    });
  });

  it("starts a link flow and hands the browser to the identity provider", async () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...realLocation, assign },
    });
    const api = createApi();
    renderSection(api);

    fireEvent.click(
      await screen.findByRole("button", { name: "Connect GitHub" }),
    );

    await waitFor(() => {
      expect(api.startSsoLink).toHaveBeenCalledWith("github");
      expect(assign).toHaveBeenCalledWith(
        "https://github.com/login/oauth/authorize?x=1",
      );
    });
    expect(
      JSON.parse(sessionStorage.getItem("jobops.ssoFlow") ?? "null"),
    ).toMatchObject({
      provider: "github",
      state: "state-1",
      flowToken: "flow-token-1",
      mode: "link",
      next: null,
    });
  });

  it("sends the current password along with a change", async () => {
    const api = createApi();
    renderSection(api);

    fireEvent.change(await screen.findByLabelText("Current password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "new-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    await waitFor(() => {
      expect(api.changeOwnPassword).toHaveBeenCalledWith(
        { password: "new-password", currentPassword: "old-password" },
        expect.anything(),
      );
    });
  });

  it("lets a password-less account set a first password", async () => {
    const api = createApi({
      getCurrentAuthUser: vi.fn(async () => ({
        ...passwordUser,
        hasPassword: false,
      })),
    });
    renderSection(api);

    expect(
      await screen.findByText(
        "This account has no password yet. Set one to keep a fallback sign-in method.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).toBeNull();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "first-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "first-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Set password" }));

    await waitFor(() => {
      expect(api.changeOwnPassword).toHaveBeenCalledWith(
        { password: "first-password" },
        expect.anything(),
      );
    });
  });

  it("refuses a confirmation that does not match", async () => {
    const api = createApi();
    renderSection(api);

    fireEvent.change(await screen.findByLabelText("Current password"), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "new-password" },
    });
    fireEvent.change(screen.getByLabelText("Confirm new password"), {
      target: { value: "different-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "New passwords do not match.",
    );
    expect(api.changeOwnPassword).not.toHaveBeenCalled();
  });

  it("hides the connected accounts block when no provider is configured", async () => {
    const api = createApi({
      getSsoProviders: vi.fn(async () => []),
      listSsoIdentities: vi.fn(async () => []),
    });
    renderSection(api);

    expect(
      await screen.findByRole("button", { name: "Change password" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Connected accounts")).toBeNull();
  });
});
