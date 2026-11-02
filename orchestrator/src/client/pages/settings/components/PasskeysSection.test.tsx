import type { PasskeySummary } from "@shared/types";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { PasskeysSection } from "./PasskeysSection";

type PasskeysApi = NonNullable<
  ComponentProps<typeof PasskeysSection>["passkeysApi"]
>;

const laptopPasskey: PasskeySummary = {
  id: "credential-1",
  name: "Work laptop",
  deviceType: "multiDevice",
  backedUp: true,
  transports: ["internal"],
  createdAt: "2026-05-13T00:00:00.000Z",
  lastUsedAt: 1_778_000_000,
};

const phonePasskey: PasskeySummary = {
  id: "credential-2",
  name: "Phone",
  deviceType: "singleDevice",
  backedUp: false,
  transports: ["hybrid"],
  createdAt: "2026-05-14T00:00:00.000Z",
  lastUsedAt: null,
};

function createPasskeysApi(overrides: Partial<PasskeysApi> = {}): PasskeysApi {
  return {
    isSupported: () => true,
    list: vi.fn(async () => [laptopPasskey, phonePasskey]),
    register: vi.fn(async () => phonePasskey),
    rename: vi.fn(async () => laptopPasskey),
    remove: vi.fn(async () => {}),
    ...overrides,
  };
}

function renderSection(passkeysApi: PasskeysApi) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <PasskeysSection passkeysApi={passkeysApi} />
    </QueryClientProvider>,
  );
}

describe("PasskeysSection", () => {
  it("lists registered passkeys and flags the synced ones", async () => {
    renderSection(createPasskeysApi());

    expect(await screen.findByText("Work laptop")).toBeInTheDocument();
    expect(screen.getByText("Phone")).toBeInTheDocument();
    expect(screen.getAllByText("Synced")).toHaveLength(1);
    expect(screen.getByText(/Last used never/)).toBeInTheDocument();
  });

  it("renames a passkey inline", async () => {
    const rename = vi.fn(async () => ({ ...laptopPasskey, name: "Studio" }));
    renderSection(createPasskeysApi({ rename }));

    await screen.findByText("Work laptop");
    fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[0]);

    const nameInput = screen.getByLabelText("Passkey name");
    expect(nameInput).toHaveValue("Work laptop");
    fireEvent.change(nameInput, { target: { value: " Studio " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(rename).toHaveBeenCalledWith("credential-1", "Studio");
    });
  });

  it("removes a passkey once the confirmation is accepted", async () => {
    const remove = vi.fn(async () => {});
    renderSection(createPasskeysApi({ remove }));

    await screen.findByText("Work laptop");
    fireEvent.click(screen.getByRole("button", { name: "Remove Work laptop" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(remove).toHaveBeenCalledWith("credential-1");
    });
  });

  it("registers a new passkey with the name from the dialog", async () => {
    const register = vi.fn(async () => phonePasskey);
    renderSection(createPasskeysApi({ register }));

    await screen.findByText("Work laptop");
    fireEvent.click(screen.getByRole("button", { name: /Add passkey/ }));

    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: " Phone " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create passkey" }));

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith("Phone");
    });
  });

  it("does not claim the account has no passkeys when the list fails to load", async () => {
    const list = vi.fn(async (): Promise<PasskeySummary[]> => {
      throw new Error("Service Unavailable");
    });
    renderSection(createPasskeysApi({ list }));

    expect(
      await screen.findByText("Couldn't load your passkeys."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No passkeys registered yet."),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it("explains why passkeys cannot be added in an unsupported browser", async () => {
    renderSection(createPasskeysApi({ isSupported: () => false }));

    await screen.findByText("Work laptop");
    expect(
      screen.getByText(/This browser cannot create passkeys/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add passkey/ })).toBeDisabled();
  });
});
