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
  importDesignResumeFromFile: vi.fn(),
  saveOnboardingModel: vi.fn(),
  saveOnboardingRxResume: vi.fn(),
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
    currentStep: string;
    onImportResumeFile: (file: File) => Promise<void>;
    onTemplateResumeChange: (value: string | null) => void;
  }) => (
    <div>
      <div>content:{props.currentStep}</div>
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
};

const incompleteModelStatus: OnboardingStatusResponse = {
  complete: false,
  nextRequirementId: "model",
  requirements: [
    {
      id: "model",
      status: "needs_action",
      title: "Connect your model",
      message: "LLM API key is missing.",
      primaryAction: "connect_model",
    },
    {
      id: "resume",
      status: "needs_action",
      title: "Load your resume",
      message: "Upload a resume before the first run.",
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
      message: "The model connection is ready.",
      primaryAction: "none",
    },
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

function renderPage() {
  return renderWithQueryClient(
    <MemoryRouter initialEntries={["/onboarding"]}>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/jobs/ready" element={<div>ready page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OnboardingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

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
  });

  it("shows one active server requirement and collapses completed checks", () => {
    vi.mocked(useOnboardingStatus).mockReturnValue({
      status: resumeBlockedStatus,
      complete: false,
      nextRequirementId: "resume",
      requirements: resumeBlockedStatus.requirements,
      checking: false,
      error: null,
      refetch: vi.fn(),
    } as any);

    renderPage();

    expect(screen.getByText("Launch Console")).toBeInTheDocument();
    expect(screen.getByText("Model connected")).toBeInTheDocument();
    expect(screen.getAllByText("Load your resume").length).toBeGreaterThan(0);
    expect(screen.getByText("content:resume")).toBeInTheDocument();
  });

  it("calls the focused model action from the active requirement", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /verify model/i }));

    await waitFor(() => {
      expect(api.saveOnboardingModel).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "openrouter",
        }),
      );
    });
  });

  it("keeps Reactive Resume blocked when the server requires template selection", () => {
    const templateBlockedStatus: OnboardingStatusResponse = {
      ...resumeBlockedStatus,
      requirements: [
        resumeBlockedStatus.requirements[0],
        {
          id: "resume",
          status: "needs_action",
          title: "Choose a Reactive Resume template",
          message: "Reactive Resume is connected. Select a template resume.",
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

    renderPage();

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

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /mock upload/i }));

    await waitFor(() => {
      expect(api.importDesignResumeFromFile).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: "resume.json",
          mediaType: "application/json",
        }),
      );
    });
  });

  it("redirects once the server status is complete", () => {
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

    renderPage();

    expect(screen.getByText("ready page")).toBeInTheDocument();
  });

  it("can replay the coach tour", () => {
    renderPage();

    expect(screen.getByTestId("coach")).toHaveTextContent("coach:0");
    fireEvent.click(screen.getByRole("button", { name: /replay guide/i }));
    expect(screen.getByTestId("coach")).toHaveTextContent("coach:1");
  });
});
