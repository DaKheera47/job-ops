import * as api from "@client/api";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { FormProvider, useForm } from "react-hook-form";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Accordion } from "@/components/ui/accordion";
import { EnvironmentSettingsSection } from "./EnvironmentSettingsSection";

vi.mock("@client/api", () => ({
  createWorkspaceUser: vi.fn(),
  getAppStatus: vi.fn(),
  getCurrentAuthUser: vi.fn(),
  listWorkspaceUsers: vi.fn(),
  resetWorkspaceUserPassword: vi.fn(),
  setWorkspaceUserDisabled: vi.fn(),
}));

const EnvironmentSettingsHarness = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const methods = useForm<UpdateSettingsInput>({
    defaultValues: {
      ukvisajobsEmail: "visa@example.com",
      ukvisajobsPassword: "",
      adzunaAppId: "adzuna-id",
      adzunaAppKey: "",
      webhookSecret: "",
    },
  });

  return (
    <QueryClientProvider client={queryClient}>
      <FormProvider {...methods}>
        <Accordion type="multiple" defaultValue={["environment"]}>
          <EnvironmentSettingsSection
            values={{
              readable: {
                ukvisajobsEmail: "visa@example.com",
                adzunaAppId: "adzuna-id",
              },
              private: {
                ukvisajobsPasswordHint: "pass",
                adzunaAppKeyHint: "adzu",
                webhookSecretHint: "sec-",
              },
            }}
            isLoading={false}
            isSaving={false}
          />
        </Accordion>
      </FormProvider>
    </QueryClientProvider>
  );
};

describe("EnvironmentSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getAppStatus).mockResolvedValue({
      appMode: "local",
      capabilities: {
        hostedSignups: false,
        platformLlm: false,
        quotas: false,
        userEditableLlmSettings: true,
      },
      hostedTenantConfigured: false,
    });
    vi.mocked(api.getCurrentAuthUser).mockResolvedValue({
      id: "admin-user",
      username: "admin",
      displayName: "Admin User",
      isSystemAdmin: true,
      isDisabled: false,
      workspaceId: "tenant-admin",
      workspaceName: "Admin Workspace",
      workspaceRole: "owner",
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
    });
    vi.mocked(api.listWorkspaceUsers).mockResolvedValue([
      {
        id: "workspace-user",
        username: "member",
        displayName: "Member User",
        isSystemAdmin: false,
        isDisabled: false,
        workspaceId: "tenant-member",
        workspaceName: "Member Workspace",
        workspaceRole: "member",
        createdAt: "2026-05-13T00:00:00.000Z",
        updatedAt: "2026-05-13T00:00:00.000Z",
      },
    ]);
  });

  it("renders values grouped logically and masks private secrets with hints", () => {
    render(<EnvironmentSettingsHarness />);

    expect(screen.getByDisplayValue("visa@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("adzuna-id")).toBeInTheDocument();

    expect(screen.getByText(/pass\*{8}/)).toBeInTheDocument();
    expect(screen.getByText(/adzu\*{8}/)).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Enable authentication"),
    ).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("username")).not.toBeInTheDocument();

    // Sections
    expect(screen.getByText("Service Accounts")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.queryByText("RxResume")).not.toBeInTheDocument();
  });

  it("updates a workspace user's reset password without crashing", async () => {
    render(<EnvironmentSettingsHarness />);

    const resetPasswordInput =
      await screen.findByPlaceholderText("New password");

    fireEvent.change(resetPasswordInput, {
      target: { value: "new-password" },
    });

    expect(resetPasswordInput).toHaveValue("new-password");
  });

  it("shows hosted workspace user management for tenant owners", async () => {
    vi.mocked(api.getAppStatus).mockResolvedValue({
      appMode: "hosted",
      capabilities: {
        hostedSignups: true,
        platformLlm: false,
        quotas: false,
        userEditableLlmSettings: true,
      },
      hostedTenantConfigured: true,
    });
    vi.mocked(api.getCurrentAuthUser).mockResolvedValue({
      id: "owner-user",
      username: "owner",
      displayName: "Owner User",
      isSystemAdmin: false,
      isDisabled: false,
      workspaceId: "tenant-hosted",
      workspaceName: "Hosted Workspace",
      workspaceRole: "owner",
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
    });

    render(<EnvironmentSettingsHarness />);

    expect(await screen.findByText("Workspace Users")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Users join this hosted workspace with private app data.",
      ),
    ).toBeInTheDocument();
    expect(api.listWorkspaceUsers).toHaveBeenCalled();
  });

  it("hides workspace user management for hosted members", async () => {
    vi.mocked(api.getAppStatus).mockResolvedValue({
      appMode: "hosted",
      capabilities: {
        hostedSignups: true,
        platformLlm: false,
        quotas: false,
        userEditableLlmSettings: true,
      },
      hostedTenantConfigured: true,
    });
    vi.mocked(api.getCurrentAuthUser).mockResolvedValue({
      id: "member-user",
      username: "member",
      displayName: "Member User",
      isSystemAdmin: false,
      isDisabled: false,
      workspaceId: "tenant-hosted",
      workspaceName: "Hosted Workspace",
      workspaceRole: "member",
      createdAt: "2026-05-13T00:00:00.000Z",
      updatedAt: "2026-05-13T00:00:00.000Z",
    });

    render(<EnvironmentSettingsHarness />);

    expect(await screen.findByText("Workspace")).toBeInTheDocument();
    expect(screen.queryByText("Workspace Users")).not.toBeInTheDocument();
    expect(api.listWorkspaceUsers).not.toHaveBeenCalled();
  });
});
