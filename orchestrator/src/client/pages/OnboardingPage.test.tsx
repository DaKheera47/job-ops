import { useDesignResume } from "@client/hooks/useDesignResume";
import { useOnboardingStatus } from "@client/hooks/useOnboardingStatus";
import type { OnboardingStatusResponse } from "@shared/types";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/client/api";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { OnboardingPage } from "./OnboardingPage";
import { useOnboardingFlow } from "./onboarding/useOnboardingFlow";

const analyticsMocks = vi.hoisted(() => ({
  trackProductEvent: vi.fn(),
}));

vi.mock("@/client/api", () => ({
  confirmOnboardingResume: vi.fn(),
  getAppStatus: vi.fn(),
  getAuthBootstrapStatus: vi.fn(),
  hasAuthenticatedSession: vi.fn(() => true),
  getProfile: vi.fn(),
  saveOnboardingProfile: vi.fn(),
  setupFirstAdmin: vi.fn(),
}));

vi.mock("@/lib/analytics", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/analytics")>()),
  trackProductEvent: analyticsMocks.trackProductEvent,
}));

vi.mock("@client/hooks/useOnboardingStatus", () => ({
  useOnboardingStatus: vi.fn(),
}));

vi.mock("@client/hooks/useDesignResume", () => ({
  useDesignResume: vi.fn(),
}));

vi.mock("./onboarding/useOnboardingFlow", () => ({
  useOnboardingFlow: vi.fn(),
}));

vi.mock("./onboarding/components/LlmConnectionStep", () => ({
  LlmConnectionStep: (props: {
    onCodexAuthStatusChange?: (status: { authenticated: boolean }) => void;
  }) => (
    <div>
      LLM configuration
      <button
        type="button"
        onClick={() =>
          props.onCodexAuthStatusChange?.({ authenticated: false })
        }
      >
        Mock Codex disconnect
      </button>
    </div>
  ),
}));

vi.mock("./onboarding/components/BaseResumeStep", () => ({
  BaseResumeStep: () => <div>Resume importer</div>,
}));

const profileStatus: OnboardingStatusResponse = {
  complete: false,
  nextRequirementId: "profile",
  requirements: [
    {
      id: "profile",
      status: "needs_action",
      title: "Tell us where you want to work",
      message: "Add search preferences.",
      primaryAction: "save_profile",
    },
    {
      id: "model",
      status: "needs_action",
      title: "Connect AI",
      message: "Connect AI.",
      primaryAction: "connect_model",
    },
    {
      id: "resume",
      status: "needs_action",
      title: "Load resume",
      message: "Load resume.",
      primaryAction: "upload_resume",
    },
  ],
};

const resumeStatus: OnboardingStatusResponse = {
  complete: false,
  nextRequirementId: "resume",
  requirements: [
    {
      id: "profile",
      status: "ready",
      title: "Saved",
      message: "Saved",
      primaryAction: "none",
    },
    {
      id: "model",
      status: "ready",
      title: "Connected",
      message: "Connected",
      primaryAction: "none",
    },
    {
      id: "resume",
      status: "needs_action",
      title: "Review your resume",
      message: "Confirm it.",
      primaryAction: "confirm_resume",
      details: { source: "local", confirmationSource: "local:doc-1" },
    },
  ],
};

const modelStatus: OnboardingStatusResponse = {
  complete: false,
  nextRequirementId: "model",
  requirements: [
    {
      id: "profile",
      status: "ready",
      title: "Saved",
      message: "Saved",
      primaryAction: "none",
    },
    {
      id: "model",
      status: "needs_action",
      title: "Connect AI",
      message: "Connect AI.",
      primaryAction: "connect_model",
    },
    {
      id: "resume",
      status: "needs_action",
      title: "Load resume",
      message: "Load resume.",
      primaryAction: "upload_resume",
    },
  ],
};

const completeStatus: OnboardingStatusResponse = {
  complete: true,
  nextRequirementId: null,
  requirements: resumeStatus.requirements.map((requirement) => ({
    ...requirement,
    status: "ready",
    primaryAction: "none",
  })),
};

function mockFlow() {
  vi.mocked(useOnboardingFlow).mockReturnValue({
    demoMode: false,
    handleImportResumeFile: vi.fn(),
    handleRxresumeSelfHostedChange: vi.fn(),
    handleSaveModel: vi.fn(),
    handleSaveRxresume: vi.fn(),
    handleTemplateResumeChange: vi.fn(),
    isBusy: false,
    isImportingResume: false,
    importingResumeFileName: null,
    isRxResumeSelfHosted: false,
    llmKeyHint: null,
    resumeSetupMode: "upload",
    rxresumeApiKeyHint: null,
    selectedProvider: "openrouter",
    settings: null,
    settingsLoading: false,
    setResumeSetupMode: vi.fn(),
    setValue: vi.fn(),
    watch: vi.fn((key: string) => (key === "rxresumeBaseResumeId" ? null : "")),
  } as unknown as ReturnType<typeof useOnboardingFlow>);
}

async function renderPage() {
  renderWithQueryClient(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/jobs/ready" element={<div>Ready page</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByText(
    "Three focused choices, then you’re in. Search terms wait until your first run.",
  );
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getAuthBootstrapStatus).mockResolvedValue({
      setupRequired: false,
    });
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
    vi.mocked(useDesignResume).mockReturnValue({
      document: null,
      status: { exists: false, documentId: null, updatedAt: null },
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });
    mockFlow();
  });

  it("creates the workspace account with only username and password", async () => {
    vi.mocked(api.getAuthBootstrapStatus).mockResolvedValue({
      setupRequired: true,
    });
    vi.mocked(api.setupFirstAdmin).mockImplementation(
      () => new Promise(() => undefined),
    );

    renderWithQueryClient(
      <MemoryRouter initialEntries={["/onboarding"]}>
        <OnboardingPage />
      </MemoryRouter>,
    );

    const username = await screen.findByLabelText("Username");
    const password = screen.getByLabelText("Password");
    expect(screen.queryByLabelText("Display name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Confirm password")).not.toBeInTheDocument();

    fireEvent.change(username, { target: { value: "admin" } });
    fireEvent.change(password, { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(password).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(api.setupFirstAdmin).toHaveBeenCalledWith({
        username: "admin",
        displayName: "admin",
        password: "password123",
      }),
    );
    expect(analyticsMocks.trackProductEvent).toHaveBeenCalledWith(
      "onboarding_account_create_submitted",
      expect.objectContaining({
        username_length_bucket: "4_10",
      }),
    );
  });

  it("saves location preferences and advances from the returned server status", async () => {
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: profileStatus,
      complete: false,
      nextRequirementId: "profile",
      requirements: profileStatus.requirements,
      checking: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useOnboardingStatus>);
    vi.mocked(api.saveOnboardingProfile).mockResolvedValue(resumeStatus);

    await renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Select country" }),
    );
    const countrySearch = screen.getByPlaceholderText("Search country...");
    fireEvent.change(countrySearch, {
      target: { value: "United Kingdom" },
    });
    await waitFor(() =>
      expect(
        screen.queryByRole("option", { name: "Afghanistan" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.keyDown(countrySearch, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /save and continue/i }));

    await waitFor(() =>
      expect(api.saveOnboardingProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          country: "united kingdom",
          cities: [],
        }),
      ),
    );
    expect(analyticsMocks.trackProductEvent).toHaveBeenCalledWith(
      "onboarding_profile_save_submitted",
      expect.objectContaining({
        has_country: true,
        city_count: 0,
        requires_visa_sponsorship: false,
      }),
    );
    expect(analyticsMocks.trackProductEvent).toHaveBeenCalledWith(
      "onboarding_profile_save_completed",
      { result: "success" },
    );
    expect(await screen.findByText("Resume importer")).toBeInTheDocument();
  });

  it("shows parsed resume details and confirms the exact source", async () => {
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: resumeStatus,
      complete: false,
      nextRequirementId: "resume",
      requirements: resumeStatus.requirements,
      checking: false,
      error: null,
      refetch: vi.fn(),
    } as ReturnType<typeof useOnboardingStatus>);
    vi.mocked(useDesignResume).mockReturnValue({
      document: { id: "doc-1" } as never,
      status: { exists: true, documentId: "doc-1", updatedAt: "2026-07-12" },
      error: null,
      isLoading: false,
      refresh: vi.fn(),
    });
    vi.mocked(api.getProfile).mockResolvedValue({
      basics: {
        name: "Sam",
        headline: "Software Engineer",
        location: { city: "London" },
      },
      sections: {
        experience: {
          items: [
            {
              id: "exp-1",
              company: "Example",
              position: "Engineer",
              location: "London",
              date: "2024",
              summary: "",
              visible: true,
            },
          ],
        },
      },
    });
    vi.mocked(api.confirmOnboardingResume).mockResolvedValue(completeStatus);

    await renderPage();

    expect(
      screen.getByRole("link", { name: /edit in resume studio/i }),
    ).toHaveAttribute("href", "/design-resume");
    expect(await screen.findByText("Sam")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /use this resume/i }));

    await waitFor(() =>
      expect(api.confirmOnboardingResume).toHaveBeenCalledWith("local:doc-1"),
    );
    expect(api.confirmOnboardingResume).toHaveBeenCalledTimes(1);
    expect(analyticsMocks.trackProductEvent).toHaveBeenCalledWith(
      "onboarding_resume_confirm_completed",
      { result: "success", source: "local" },
    );
    expect(analyticsMocks.trackProductEvent).toHaveBeenCalledWith(
      "onboarding_completed",
      expect.objectContaining({ completed_steps: 3 }),
    );
  });

  it("reconciles onboarding when the shared Codex control disconnects", async () => {
    const refetch = vi.fn();
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: modelStatus,
      complete: false,
      nextRequirementId: "model",
      requirements: modelStatus.requirements,
      checking: false,
      error: null,
      refetch,
    } as unknown as ReturnType<typeof useOnboardingStatus>);

    await renderPage();
    fireEvent.click(
      await screen.findByRole("button", { name: "Mock Codex disconnect" }),
    );
    expect(refetch).toHaveBeenCalledOnce();
  });
});
