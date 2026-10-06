import type { Story } from "@ladle/react";
import type { PasskeySummary } from "@shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { PasskeysSection } from "./PasskeysSection";

type PasskeysApi = React.ComponentProps<typeof PasskeysSection>["passkeysApi"];

const laptopPasskey: PasskeySummary = {
  id: "credential-laptop",
  name: "Work laptop",
  deviceType: "multiDevice",
  backedUp: true,
  transports: ["internal", "hybrid"],
  createdAt: "2026-04-02T09:15:00.000Z",
  lastUsedAt: 1_778_000_000,
};

const yubikeyPasskey: PasskeySummary = {
  id: "credential-yubikey",
  name: "YubiKey 5C",
  deviceType: "singleDevice",
  backedUp: false,
  transports: ["usb", "nfc"],
  createdAt: "2026-04-18T17:40:00.000Z",
  lastUsedAt: null,
};

function createPasskeysApi(
  passkeys: PasskeySummary[],
  options: {
    isSupported?: boolean;
    registerError?: Error;
    listError?: Error;
  } = {},
): PasskeysApi {
  let current = passkeys;
  return {
    isSupported: () => options.isSupported ?? true,
    list: async () => {
      if (options.listError) throw options.listError;
      return current;
    },
    register: async (name) => {
      if (options.registerError) throw options.registerError;
      const created: PasskeySummary = {
        ...yubikeyPasskey,
        id: `credential-${current.length + 1}`,
        name: name || `Passkey ${current.length + 1}`,
        createdAt: new Date().toISOString(),
      };
      current = [...current, created];
      return created;
    },
    rename: async (id, name) => {
      current = current.map((passkey) =>
        passkey.id === id ? { ...passkey, name } : passkey,
      );
      const renamed = current.find((passkey) => passkey.id === id);
      if (!renamed) throw new Error("Passkey not found");
      return renamed;
    },
    remove: async (id) => {
      current = current.filter((passkey) => passkey.id !== id);
    },
  };
}

const StoryShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <QueryClientProvider
    client={
      new QueryClient({
        defaultOptions: { queries: { retry: false } },
      })
    }
  >
    <main className="min-h-[420px] w-full max-w-[720px] bg-background p-6 text-foreground">
      {children}
    </main>
  </QueryClientProvider>
);

export const WithPasskeys: Story = () => (
  <StoryShell>
    <PasskeysSection
      passkeysApi={createPasskeysApi([laptopPasskey, yubikeyPasskey])}
    />
  </StoryShell>
);
WithPasskeys.storyName = "With passkeys";

export const Empty: Story = () => (
  <StoryShell>
    <PasskeysSection passkeysApi={createPasskeysApi([])} />
  </StoryShell>
);
Empty.storyName = "No passkeys yet";

export const UnsupportedBrowser: Story = () => (
  <StoryShell>
    <PasskeysSection
      passkeysApi={createPasskeysApi([laptopPasskey], { isSupported: false })}
    />
  </StoryShell>
);
UnsupportedBrowser.storyName = "Unsupported browser";

export const ListFailure: Story = () => (
  <StoryShell>
    <PasskeysSection
      passkeysApi={createPasskeysApi([], {
        listError: new Error("Failed to load passkeys"),
      })}
    />
  </StoryShell>
);
ListFailure.storyName = "List request failed";

export const RegistrationFailure: Story = () => (
  <StoryShell>
    <PasskeysSection
      passkeysApi={createPasskeysApi([laptopPasskey], {
        registerError: new Error("This device already has a passkey"),
      })}
    />
  </StoryShell>
);
RegistrationFailure.storyName = "Registration failure";
