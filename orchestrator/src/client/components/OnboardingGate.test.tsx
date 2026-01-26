import * as api from "@client/api";
import { useSettings } from "@client/hooks/useSettings";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingGate } from "./OnboardingGate";

vi.mock("@client/api", () => ({
  validateOpenrouter: vi.fn(),
  validateRxresume: vi.fn(),
  validateResumeConfig: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: vi.fn(),
}));

vi.mock("@client/pages/settings/components/SettingsInput", () => ({
  SettingsInput: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock("@client/pages/settings/components/BaseResumeSelection", () => ({
  BaseResumeSelection: () => <div>Base resume selection</div>,
}));

vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TabsTrigger: ({ children }: { children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

vi.mock("@/components/ui/progress", () => ({
  Progress: () => <div>Progress</div>,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const settingsResponse = {
  settings: {
    openrouterApiKeyHint: null,
    rxresumeEmail: "",
    rxresumePasswordHint: null,
    rxresumeBaseResumeId: null,
  },
  isLoading: false,
  refreshSettings: vi.fn(),
};

describe("OnboardingGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSettings).mockReturnValue(settingsResponse as any);
  });

  it("renders the gate once validations complete and any fail", async () => {
    vi.mocked(api.validateOpenrouter).mockResolvedValue({
      valid: false,
      message: "Invalid",
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });

    render(<OnboardingGate />);

    await waitFor(() => expect(api.validateOpenrouter).toHaveBeenCalled());
    expect(screen.getByText("Welcome to Job Ops")).toBeInTheDocument();
  });

  it("hides the gate when all validations succeed", async () => {
    vi.mocked(api.validateOpenrouter).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });

    render(<OnboardingGate />);

    await waitFor(() => expect(api.validateOpenrouter).toHaveBeenCalled());
    expect(screen.queryByText("Welcome to Job Ops")).not.toBeInTheDocument();
  });
});
