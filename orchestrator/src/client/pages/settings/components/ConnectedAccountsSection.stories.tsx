import type { Story } from "@ladle/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import {
  type ConnectedAccountsApi,
  ConnectedAccountsSection,
} from "./ConnectedAccountsSection";

const passwordUser = {
  id: "user-1",
  username: "sadia",
  displayName: "Sadia",
  isSystemAdmin: true,
  isDisabled: false,
  hasPassword: true,
  workspaceId: "tenant_default",
  workspaceName: "JobOps",
  createdAt: "2026-05-13T00:00:00.000Z",
  updatedAt: "2026-05-13T00:00:00.000Z",
};

const providers = [
  { id: "google" as const, displayName: "Google" },
  { id: "github" as const, displayName: "GitHub" },
  { id: "oidc" as const, displayName: "Pocket ID" },
];

const googleIdentity = {
  id: "identity-1",
  provider: "google" as const,
  email: "sadia@example.com",
  displayName: "Sadia",
  createdAt: "2026-05-20T00:00:00.000Z",
};

function createApi(
  overrides: Partial<ConnectedAccountsApi> = {},
): ConnectedAccountsApi {
  return {
    changeOwnPassword: async () => {},
    getCurrentAuthUser: async () => passwordUser,
    getSsoProviders: async () => providers,
    listSsoIdentities: async () => [googleIdentity],
    startSsoLink: async () => ({
      provider: "github",
      authorizationUrl: "https://github.com/login/oauth/authorize",
      state: "state",
      flowToken: "flow-token",
    }),
    unlinkSsoIdentity: async () => {},
    ...overrides,
  };
}

const ConnectedAccountsHarness: React.FC<{ api: ConnectedAccountsApi }> = ({
  api,
}) => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-[420px] bg-background p-6 text-foreground">
        <section className="mx-auto max-w-3xl">
          <ConnectedAccountsSection api={api} />
        </section>
      </main>
    </QueryClientProvider>
  );
};

export const WithLinkedProvider: Story = () => (
  <ConnectedAccountsHarness api={createApi()} />
);

WithLinkedProvider.storyName = "Password user with a linked provider";

export const SsoOnlyUser: Story = () => (
  <ConnectedAccountsHarness
    api={createApi({
      getCurrentAuthUser: async () => ({
        ...passwordUser,
        hasPassword: false,
      }),
    })}
  />
);

SsoOnlyUser.storyName = "SSO-only user without a password";
