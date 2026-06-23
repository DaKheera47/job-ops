import * as api from "@client/api";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useOnboardingStatus } from "@client/hooks/useOnboardingStatus";
import { useRxResumeConfigState } from "@client/hooks/useRxResumeConfigState";
import { useSettings } from "@client/hooks/useSettings";
import type { OnboardingStatusResponse } from "@shared/types";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { OnboardingPage } from "./OnboardingPage";

vi.mock("@client/api", () => ({
  getAppStatus: vi.fn(),
  getAuthBootstrapStatus: vi.fn(async () => ({ setupRequired: false })),
  hasAuthenticatedSession: vi.fn(() => true),
  importDesignResumeFromFile: vi.fn(),
  saveOnboardingModel: vi.fn(),
  saveOnboardingRxResume: vi.fn(),
  setupFirstAdmin: vi.fn(),
  suggestOnboardingSearchTerms: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@client/hooks/useDemoInfo", () => ({
  useDemoInfo: vi.fn(),
}));

vi.mock("@client/hooks/useSettings", () => ({
  useSettings: vi.fn(),
}));

vi.mock("@client/hooks/useRxResumeConfigState", () => ({
  useRxResumeConfigState: vi.fn(),
}));

vi.mock("@client/hooks/useOnboardingStatus", () => ({
  useOnboardingStatus: vi.fn(),
}));

vi.mock("./onboarding/components/OnboardingCoach", () => ({
  OnboardingCoach: (props: { replayNonce: number }) => (
    <div data-testid="coach">coach:{props.replayNonce}</div>
  ),
}));

vi.mock("./onboarding/components/OnboardingStepContent", () => ({
  OnboardingStepContent: (props: {
    allowReactiveResume?: boolean;
    currentStep: string;
    onCodexAuthStatusChange?: (status: {
      authenticated: boolean;
      loginInProgress: boolean;
    }) => void;
    onImportResumeFile: (file: File) => Promise<void>;
    onTemplateResumeChange: (value: string | null) => void;
  }) => (
    <div>
      <div>content:{props.currentStep}</div>
      <div>
        reactive-resume:
        {props.allowReactiveResume === false ? "off" : "on"}
      </div>
      <button
        type="button"
        onClick={() =>
          void props.onImportResumeFile(
            new File(["resume"], "resume.json", {
              type: "application/json",
            }),
          )
        }
      >
        Mock upload
      </button>
      <button
        type="button"
        onClick={() => props.onTemplateResumeChange("resume-2")}
      >
        Choose alternate resume
      </button>
      <button
        type="button"
        onClick={() =>
          props.onCodexAuthStatusChange?.({
            authenticated: true,
            loginInProgress: false,
          })
        }
      >
        Mock Codex authenticated
      </button>
    </div>
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

const baseSettings = {
  llmProvider: { value: "openrouter", default: "openrouter", override: null },
  llmBaseUrl: { value: "", default: "", override: null },
  llmApiKeyHint: "sk-t",
  model: { value: "gpt-4o", default: "gpt-4o", override: null },
  pdfRenderer: { value: "rxresume", default: "rxresume", override: null },
  rxresumeUrl: "https://resume.example.com",
  rxresumeApiKeyHint: "rx-k",
  rxresumeBaseResumeId: "resume-1",
  searchTerms: {
    value: ["web developer"],
    default: ["web developer"],
    override: null,
  },
};

const authUser = {
  id: "user-1",
  username: "admin",
  displayName: "Admin User",
  isSystemAdmin: true,
  isDisabled: false,
  workspaceId: "tenant_default",
  workspaceName: "JobOps",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
};

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

const hostedPlatformLlmStatus = {
  appMode: "hosted" as const,
  capabilities: {
    hostedSignups: true,
    platformLlm: true,
    quotas: true,
    userEditableLlmSettings: false,
  },
  hostedTenantConfigured: true,
};

const analyticsTrack = vi.fn();

function getTrackedEvent(name: string) {
  return analyticsTrack.mock.calls.find((call) => call[0] === name);
}

const incompleteModelStatus: OnboardingStatusResponse = {
  complete: false,
  nextRequirementId: "model",
  requirements: [
    {
      id: "model",
      status: "needs_action",
      title: "Connect your LLM",
      message: "LLM API key is missing.",
      primaryAction: "connect_model",
    },
    {
      id: "resume",
      status: "needs_action",
      title: "Load your resume",
      message:
        "Upload a resume file, or connect Reactive Resume and choose a template. This gives Job Ops the baseline it needs for matching, fit assessment, and better application workflows.",
      primaryAction: "upload_resume",
    },
  ],
};

const resumeBlockedStatus: OnboardingStatusResponse = {
  complete: false,
  nextRequirementId: "resume",
  requirements: [
    {
      id: "model",
      status: "ready",
      title: "Model connected",
      message:
        "The LLM is ready to power scoring, tailoring, ghostwriting, and email classification.",
      primaryAction: "none",
    },
    {
      id: "resume",
      status: "needs_action",
      title: "Load your resume",
      message:
        "Upload a resume file, or connect Reactive Resume and choose a template. This gives Job Ops the baseline it needs for matching, fit assessment, and better application workflows.",
      primaryAction: "upload_resume",
    },
  ],
};

async function renderPage() {
  const rendered = renderWithQueryClient(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/jobs/ready" element={<div>ready page</div>} />
      </Routes>
    </MemoryRouter>,
  );
  await waitFor(() => {
    expect(api.getAuthBootstrapStatus).toHaveBeenCalled();
  });
  await waitFor(() => {
    expect(screen.queryAllByText("Loading launch console...")).toHaveLength(0);
  });
  return rendered;
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(window, "umami", {
      configurable: true,
      value: { track: analyticsTrack },
    });

    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });
    vi.mocked(useSettings).mockReturnValue({
      settings: baseSettings as any,
      isLoading: false,
      refreshSettings: vi.fn(),
      error: null,
      showSponsorInfo: true,
      renderMarkdownInJobDescriptions: true,
      autoTailorOnManualImport: true,
    });
    vi.mocked(useRxResumeConfigState).mockReturnValue({
      storedRxResume: { hasV5ApiKey: true, hasBaseUrl: true },
      baseResumeId: "resume-1",
      syncBaseResumeId: () => "resume-1",
      getBaseResumeId: () => "resume-1",
      setBaseResumeId: vi.fn(),
    } as any);
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: incompleteModelStatus,
      complete: false,
      nextRequirementId: "model",
      requirements: incompleteModelStatus.requirements,
      checking: false,
      error: null,
      refetch: vi.fn(),
    } as any);
    vi.mocked(api.saveOnboardingModel).mockResolvedValue(resumeBlockedStatus);
    vi.mocked(api.saveOnboardingRxResume).mockResolvedValue(
      resumeBlockedStatus,
    );
    vi.mocked(api.importDesignResumeFromFile).mockResolvedValue({
      id: "doc-1",
      updatedAt: "2026-06-01T00:00:00.000Z",
    } as any);
    vi.mocked(api.setupFirstAdmin).mockResolvedValue(authUser);
    vi.mocked(api.suggestOnboardingSearchTerms).mockResolvedValue({
      terms: ["Backend Engineer", "Platform Engineer"],
      source: "fallback",
    });
    vi.mocked(api.updateSettings).mockImplementation(async (update) => {
      const searchTerms =
        update.searchTerms ?? baseSettings.searchTerms.override;
      return {
        ...baseSettings,
        searchTerms: {
          value: searchTerms ?? baseSettings.searchTerms.value,
          default: baseSettings.searchTerms.default,
          override: searchTerms,
        },
        pdfRenderer: {
          ...baseSettings.pdfRenderer,
          value: update.pdfRenderer ?? baseSettings.pdfRenderer.value,
          override: update.pdfRenderer ?? baseSettings.pdfRenderer.override,
        },
      } as any;
    });
    vi.mocked(api.getAppStatus).mockResolvedValue(localAppStatus);
  });

  it("shows one active server requirement and collapses completed checks", async () => {
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: resumeBlockedStatus,
      complete: false,
      nextRequirementId: "resume",
      requirements: resumeBlockedStatus.requirements,
      checking: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await renderPage();

    expect(await screen.findByText("content:resume")).toBeInTheDocument();
    expect(screen.getByText("Launch Console")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /account workspace/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("2/4")).toBeInTheDocument();
    expect(screen.getByText("Model connected")).toBeInTheDocument();
    expect(screen.getAllByText("Load your resume").length).toBeGreaterThan(0);
  });

  it("lets users return to completed onboarding steps for edits", async () => {
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: resumeBlockedStatus,
      complete: false,
      nextRequirementId: "resume",
      requirements: resumeBlockedStatus.requirements,
      checking: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await renderPage();

    expect(await screen.findByText("content:resume")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /previous step/i }));

    expect(await screen.findByText("content:model")).toBeInTheDocument();
  });

  it("hides account and model launch steps in hosted platform LLM mode", async () => {
    const hostedResumeStatus: OnboardingStatusResponse = {
      complete: false,
      nextRequirementId: "resume",
      requirements: [
        {
          id: "resume",
          status: "needs_action",
          title: "Load your resume",
          message:
            "Upload a resume file, or connect Reactive Resume and choose a template.",
          primaryAction: "upload_resume",
        },
      ],
    };
    vi.mocked(api.getAppStatus).mockResolvedValue(hostedPlatformLlmStatus);
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: hostedResumeStatus,
      complete: false,
      nextRequirementId: "resume",
      requirements: hostedResumeStatus.requirements,
      checking: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await renderPage();

    expect(await screen.findByText("content:resume")).toBeInTheDocument();
    expect(screen.getByText("reactive-resume:off")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /account workspace/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /model connection/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Step 1 of 2")).toBeInTheDocument();
    expect(screen.getByText("0/2")).toBeInTheDocument();
    expect(
      screen.getByText("Upload your existing resume, PDF or DOCX"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Workspace account created"),
    ).not.toBeInTheDocument();
  });

  it("calls the focused model action from the active requirement", async () => {
    await renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /verify llm connection/i }),
    );

    await waitFor(() => {
      expect(api.saveOnboardingModel).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openrouter",
        }),
      );
    });
    expect(getTrackedEvent("onboarding_model_verify_submitted")).toEqual([
      "onboarding_model_verify_submitted",
      expect.objectContaining({
        provider: "openrouter",
        has_key_input: false,
      }),
    ]);
    expect(getTrackedEvent("onboarding_model_verify_completed")).toEqual([
      "onboarding_model_verify_completed",
      expect.objectContaining({
        result: "success",
        provider: "openrouter",
      }),
    ]);
    expect(await screen.findByText("content:resume")).toBeInTheDocument();
  });

  it("verifies and persists the Codex provider when Codex auth completes", async () => {
    vi.mocked(useSettings).mockReturnValue({
      settings: {
        ...baseSettings,
        llmProvider: {
          value: "codex",
          default: "codex",
          override: "codex",
        },
      } as any,
      isLoading: false,
      refreshSettings: vi.fn(),
      error: null,
      showSponsorInfo: true,
      renderMarkdownInJobDescriptions: true,
      autoTailorOnManualImport: true,
    });

    await renderPage();

    fireEvent.click(
      screen.getByRole("button", { name: /mock codex authenticated/i }),
    );

    await waitFor(() => {
      expect(api.saveOnboardingModel).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "codex",
          apiKey: null,
          baseUrl: null,
        }),
      );
    });
  });

  it("keeps Reactive Resume blocked when the server requires template selection", async () => {
    const templateBlockedStatus: OnboardingStatusResponse = {
      ...resumeBlockedStatus,
      requirements: [
        resumeBlockedStatus.requirements[0],
        {
          id: "resume",
          status: "needs_action",
          title: "Choose a Reactive Resume template",
          message:
            "Reactive Resume is connected. Select the resume Job Ops should use for matching, fit assessment, and applications.",
          primaryAction: "select_rxresume_template",
        },
      ],
    };
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: templateBlockedStatus,
      complete: false,
      nextRequirementId: "resume",
      requirements: templateBlockedStatus.requirements,
      checking: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await renderPage();

    expect(
      screen.getAllByText("Choose a Reactive Resume template").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /save template/i }),
    ).toBeEnabled();
  });

  it("keeps file upload on the design-resume import endpoint", async () => {
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: resumeBlockedStatus,
      complete: false,
      nextRequirementId: "resume",
      requirements: resumeBlockedStatus.requirements,
      checking: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: /mock upload/i }));

    await waitFor(() => {
      expect(api.importDesignResumeFromFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: "resume.json",
          mediaType: "application/json",
        }),
      );
    });
    expect(getTrackedEvent("onboarding_resume_upload_submitted")).toEqual([
      "onboarding_resume_upload_submitted",
      expect.objectContaining({
        file_type: "json",
        file_size_bucket: "lt_100kb",
      }),
    ]);
    expect(getTrackedEvent("onboarding_resume_upload_completed")).toEqual([
      "onboarding_resume_upload_completed",
      expect.objectContaining({
        result: "success",
        file_type: "json",
      }),
    ]);
  });

  it("prepares search terms before opening the ready queue", async () => {
    const completeStatus: OnboardingStatusResponse = {
      complete: true,
      nextRequirementId: null,
      requirements: resumeBlockedStatus.requirements.map((requirement) => ({
        ...requirement,
        status: "ready",
        primaryAction: "none",
      })),
    };
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: completeStatus,
      complete: true,
      nextRequirementId: null,
      requirements: completeStatus.requirements,
      checking: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    await renderPage();

    expect(
      await screen.findByText("Ready for the first run"),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(api.suggestOnboardingSearchTerms).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        searchTerms: ["Backend Engineer", "Platform Engineer"],
      });
    });
    expect(screen.queryByText("ready page")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /open ready queue/i }));
    expect(await screen.findByText("ready page")).toBeInTheDocument();
    expect(getTrackedEvent("onboarding_search_terms_completed")).toEqual([
      "onboarding_search_terms_completed",
      expect.objectContaining({
        result: "success",
        source: "fallback",
        terms_count: 2,
      }),
    ]);
    expect(getTrackedEvent("onboarding_completed")).toEqual([
      "onboarding_completed",
      expect.objectContaining({
        completed_steps: 4,
        search_terms_source: "fallback",
      }),
    ]);
  });

  it("can replay the coach tour", async () => {
    await renderPage();

    expect(screen.getByTestId("coach")).toHaveTextContent("coach:0");
    fireEvent.click(screen.getByRole("button", { name: /replay guide/i }));
    expect(screen.getByTestId("coach")).toHaveTextContent("coach:1");
  });

  it("creates the first account inside onboarding before launch checks", async () => {
    vi.mocked(api.getAuthBootstrapStatus).mockResolvedValueOnce({
      setupRequired: true,
    });

    await renderPage();

    expect(
      screen.getByText("Create your workspace account"),
    ).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText("0/4")).toBeInTheDocument();
    expect(screen.getByTestId("coach")).toHaveTextContent("coach:0");

    fireEvent.click(screen.getByRole("button", { name: /model connection/i }));
    expect(screen.getByText("Connect your model")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /create account first/i }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /create account first/i }),
    );
    expect(
      screen.getByText("Create your workspace account"),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/^name$/i), {
      target: { value: "Admin User" },
    });
    fireEvent.change(screen.getByLabelText(/^username$/i), {
      target: { value: "admin" },
    });
    fireEvent.change(screen.getByLabelText(/^password$/i), {
      target: { value: "supersecret" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => {
      expect(api.setupFirstAdmin).toHaveBeenCalledWith({
        username: "admin",
        password: "supersecret",
        displayName: "Admin User",
      });
    });
    expect(getTrackedEvent("onboarding_account_create_submitted")).toEqual([
      "onboarding_account_create_submitted",
      expect.objectContaining({
        has_display_name: true,
        username_length_bucket: "4_10",
      }),
    ]);
    expect(getTrackedEvent("onboarding_account_create_completed")).toEqual([
      "onboarding_account_create_completed",
      expect.objectContaining({
        result: "success",
        credential_length_bucket: "11_30",
      }),
    ]);
    expect(await screen.findByText("content:model")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /account workspace/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("1/4")).toBeInTheDocument();
  });
});
