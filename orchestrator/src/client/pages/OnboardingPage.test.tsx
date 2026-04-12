import * as api from "@client/api";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useOnboardingRequirement } from "@client/hooks/useOnboardingRequirement";
import { useRxResumeConfigState } from "@client/hooks/useRxResumeConfigState";
import { useSettings } from "@client/hooks/useSettings";
import { validateAndMaybePersistRxResumeMode } from "@client/lib/rxresume-config";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { OnboardingPage } from "./OnboardingPage";

vi.mock("@client/api", () => ({
  importDesignResumeFromFile: vi.fn(),
  suggestOnboardingSearchTerms: vi.fn(),
  validateLlm: vi.fn(),
  validateRxresume: vi.fn(),
  validateResumeConfig: vi.fn(),
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

vi.mock("@client/hooks/useOnboardingRequirement", () => ({
  useOnboardingRequirement: vi.fn(),
}));

vi.mock("@client/lib/rxresume-config", () => ({
  getRxResumeCredentialDrafts: vi.fn((values) => ({
    baseUrl: values.rxresumeUrl?.trim() ?? "",
    apiKey: values.rxresumeApiKey?.trim() ?? "",
  })),
  getRxResumeMissingCredentialLabels: vi.fn(() => []),
  validateAndMaybePersistRxResumeMode: vi.fn(),
}));

vi.mock("@client/components/ReactiveResumeConfigPanel", () => ({
  ReactiveResumeConfigPanel: () => <div>Reactive resume panel</div>,
}));

vi.mock("@client/pages/settings/components/BaseResumeSelection", () => ({
  BaseResumeSelection: () => <div>Base resume selection</div>,
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
  pdfRenderer: { value: "rxresume", default: "rxresume", override: null },
  onboardingBasicAuthDecision: null,
  rxresumeUrl: "https://resume.example.com",
  rxresumeApiKeyHint: "rx-k",
  rxresumeBaseResumeId: "resume-1",
  searchTerms: {
    value: ["Platform Engineer"],
    default: ["web developer"],
    override: ["Platform Engineer"],
  },
  basicAuthUser: null,
  basicAuthPassword: null,
  basicAuthPasswordHint: null,
  basicAuthActive: false,
};

let currentSettings: any;

function getStepButton(label: RegExp) {
  const element = screen.getByText(label);
  const button = element.closest("button");
  if (!button) {
    throw new Error(`Expected ${label.toString()} to be inside a step button`);
  }
  return button;
}

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
    currentSettings = { ...baseSettings };

    vi.mocked(useDemoInfo).mockReturnValue({
      demoMode: false,
      resetCadenceHours: 6,
      lastResetAt: null,
      nextResetAt: null,
      baselineVersion: null,
      baselineName: null,
    });

    vi.mocked(useSettings).mockImplementation(() => ({
      settings: currentSettings,
      isLoading: false,
      refreshSettings: vi.fn(),
      error: null,
      showSponsorInfo: true,
      renderMarkdownInJobDescriptions: true,
    }));

    vi.mocked(useRxResumeConfigState).mockReturnValue({
      storedRxResume: {
        hasV5ApiKey: true,
        hasBaseUrl: true,
      },
      baseResumeId: "resume-1",
      syncBaseResumeId: () => "resume-1",
      getBaseResumeId: () => "resume-1",
      setBaseResumeId: vi.fn(),
    } as any);
    vi.mocked(useOnboardingRequirement).mockImplementation(() => ({
      checking: false,
      complete: Boolean(
        (currentSettings.basicAuthActive ||
          currentSettings.onboardingBasicAuthDecision !== null) &&
          Array.isArray(currentSettings.searchTerms?.override) &&
          currentSettings.searchTerms.override.length > 0,
      ),
    }));
    vi.mocked(validateAndMaybePersistRxResumeMode).mockResolvedValue({
      validation: {
        valid: true,
        message: null,
      },
    } as any);
    vi.mocked(api.suggestOnboardingSearchTerms).mockResolvedValue({
      terms: ["Platform Engineer", "Backend Engineer"],
      source: "ai",
    });
  });

  it("keeps the LLM step visible even when a key hint already exists", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: false,
      message: "Connection failed",
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });

    renderPage();

    await waitFor(() => expect(api.validateLlm).toHaveBeenCalled());
    expect(
      screen.getByText("Choose the LLM connection Job Ops should use."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(
      screen.getByText(/leave blank to keep the saved key/i),
    ).toBeInTheDocument();
  });

  it("does not treat local providers as validated before the connection check passes", async () => {
    currentSettings = {
      ...baseSettings,
      llmProvider: { value: "lmstudio", default: "lmstudio", override: null },
      llmBaseUrl: {
        value: "http://localhost:1234",
        default: "",
        override: null,
      },
      llmApiKeyHint: null,
    };

    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: false,
      message: "LM Studio is unreachable",
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });

    renderPage();

    await waitFor(() => {
      expect(api.validateLlm).toHaveBeenCalledWith({
        provider: "lmstudio",
        baseUrl: "http://localhost:1234",
        apiKey: undefined,
      });
    });

    expect(
      screen.getByRole("button", { name: /save connection/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /revalidate connection/i }),
    ).not.toBeInTheDocument();
  });

  it("shows the saved LLM connection success state in the detail panel", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
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

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("OpenRouter connection verified."),
      ).toBeInTheDocument();
    });
  });

  it("defaults the authentication step to lock it down", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
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

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Choose the LLM connection Job Ops should use."),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /basic auth/i }));

    await waitFor(() => {
      expect(screen.getByText("Secure your workspace")).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/lock it down/i)).toBeChecked();
    expect(
      screen.getByRole("button", { name: /enable authentication/i }),
    ).toBeInTheDocument();
  });

  it("renders the new search terms step in the onboarding rail", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
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

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search terms/i }),
      ).toBeInTheDocument();
    });
  });

  it("does not auto-generate search terms when explicit saved terms already exist", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
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

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /search terms/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Choose the job titles to search for."),
      ).toBeInTheDocument();
    });

    expect(api.suggestOnboardingSearchTerms).not.toHaveBeenCalled();
    expect(screen.getByText(/saved search terms/i)).toBeInTheDocument();
  });

  it("auto-populates search terms from the resume when no explicit override exists", async () => {
    currentSettings = {
      ...baseSettings,
      searchTerms: {
        value: ["web developer"],
        default: ["web developer"],
        override: null,
      },
    };

    vi.mocked(api.validateLlm).mockResolvedValue({
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
    vi.mocked(api.suggestOnboardingSearchTerms).mockResolvedValue({
      terms: ["Platform Engineer", "Backend Engineer"],
      source: "ai",
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /search terms/i }));

    await waitFor(() => {
      expect(api.suggestOnboardingSearchTerms).toHaveBeenCalledTimes(1);
    });

    expect(
      screen.getByText(/^generated from your resume$/i),
    ).toBeInTheDocument();

    const collapsedTokens = screen.getByTestId(
      "onboarding-search-terms-collapsed-tokens",
    );
    expect(
      within(collapsedTokens).getByText("Platform Engineer"),
    ).toBeInTheDocument();
    expect(
      within(collapsedTokens).getByText("Backend Engineer"),
    ).toBeInTheDocument();
  });

  it("saves edited search terms through settings updates", async () => {
    currentSettings = {
      ...baseSettings,
      searchTerms: {
        value: ["web developer"],
        default: ["web developer"],
        override: null,
      },
    };

    vi.mocked(api.validateLlm).mockResolvedValue({
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
    vi.mocked(api.suggestOnboardingSearchTerms).mockResolvedValue({
      terms: ["Platform Engineer", "Backend Engineer"],
      source: "ai",
    });
    vi.mocked(api.updateSettings).mockImplementation(async (update) => {
      currentSettings = {
        ...currentSettings,
        ...("searchTerms" in update
          ? {
              searchTerms: {
                value: update.searchTerms,
                default: ["web developer"],
                override: update.searchTerms,
              },
            }
          : {}),
      };
      return currentSettings;
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /search terms/i }));

    await waitFor(() => {
      expect(api.suggestOnboardingSearchTerms).toHaveBeenCalledTimes(1);
    });

    const input = screen.getByPlaceholderText("Type a role and press Enter");
    fireEvent.change(input, {
      target: { value: "Staff Software Engineer" },
    });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /save search terms/i }));

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        searchTerms: [
          "Platform Engineer",
          "Backend Engineer",
          "Staff Software Engineer",
        ],
      });
    });
  });

  it("lets the user skip basic auth and finish onboarding", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
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
    vi.mocked(api.updateSettings).mockImplementation(async () => {
      currentSettings = {
        ...currentSettings,
        onboardingBasicAuthDecision: "skipped",
      };
      return currentSettings;
    });

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Choose the LLM connection Job Ops should use."),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /basic auth/i }));

    await waitFor(() => {
      expect(screen.getByText("Secure your workspace")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/skip for now/i));
    fireEvent.click(screen.getByRole("button", { name: /finish onboarding/i }));

    await waitFor(() => {
      expect(screen.getByText("ready page")).toBeInTheDocument();
    });
    expect(api.updateSettings).toHaveBeenCalledWith({
      onboardingBasicAuthDecision: "skipped",
    });
  });

  it("does not leave onboarding early when basic auth is saved before the other steps are complete", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: false,
      message: "Connection failed",
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.updateSettings).mockResolvedValue({
      ...baseSettings,
      onboardingBasicAuthDecision: "skipped",
    } as any);

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Choose the LLM connection Job Ops should use."),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /basic auth/i }));

    await waitFor(() => {
      expect(screen.getByText("Secure your workspace")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/skip for now/i));
    fireEvent.click(screen.getByRole("button", { name: /finish onboarding/i }));

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        onboardingBasicAuthDecision: "skipped",
      });
    });

    expect(screen.queryByText("ready page")).not.toBeInTheDocument();
    expect(screen.getByText("Secure your workspace")).toBeInTheDocument();
  });

  it("does not finish onboarding when only default search terms exist", async () => {
    currentSettings = {
      ...baseSettings,
      onboardingBasicAuthDecision: "skipped",
      searchTerms: {
        value: ["web developer"],
        default: ["web developer"],
        override: null,
      },
    };

    vi.mocked(api.validateLlm).mockResolvedValue({
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

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Choose the LLM connection Job Ops should use."),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("ready page")).not.toBeInTheDocument();
    expect(
      screen.getByText("Choose the LLM connection Job Ops should use."),
    ).toBeInTheDocument();
  });

  it("does not auto-advance after saving the LLM step", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
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
    vi.mocked(api.updateSettings).mockResolvedValue(baseSettings as any);

    renderPage();

    await waitFor(() => {
      expect(
        screen.getByText("Choose the LLM connection Job Ops should use."),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: /revalidate connection/i }),
    );

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalled();
    });

    expect(
      screen.getByText("Choose the LLM connection Job Ops should use."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Import your current resume."),
    ).not.toBeInTheDocument();
  });

  it("keeps the RxResume URL hidden unless self-hosted mode is enabled", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
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

    currentSettings = {
      ...baseSettings,
      rxresumeUrl: "",
    };

    vi.mocked(useSettings).mockImplementation(() => ({
      settings: currentSettings,
      isLoading: false,
      refreshSettings: vi.fn(),
      error: null,
      showSponsorInfo: true,
      renderMarkdownInJobDescriptions: true,
    }));

    renderPage();

    fireEvent.click(getStepButton(/^Resume$/i));
    fireEvent.click(screen.getByText("Use Reactive Resume"));

    await waitFor(() => {
      expect(
        screen.getByText("Import your current resume."),
      ).toBeInTheDocument();
    });

    expect(screen.queryByLabelText(/custom url/i)).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("checkbox", { name: /self-hosted reactive resume/i }),
    );

    expect(screen.getByLabelText(/custom url/i)).toBeInTheDocument();
  });

  it("does not show resume errors before the user tries to validate the step", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(validateAndMaybePersistRxResumeMode).mockResolvedValue({
      validation: {
        valid: false,
        message: "Reactive Resume is not configured",
      },
    } as any);
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: false,
      message: "Reactive Resume is not configured",
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: false,
      message:
        "No local resume is ready yet. Upload a PDF or DOCX resume, or connect Reactive Resume and select a template resume.",
    });

    renderPage();

    fireEvent.click(getStepButton(/^Resume$/i));

    await waitFor(() => {
      expect(api.validateResumeConfig).toHaveBeenCalled();
    });

    expect(
      screen.queryByText(
        /no local resume is ready yet\. upload a pdf or docx resume, or connect reactive resume and select a template resume\./i,
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        /upload a resume here, or switch to the reactive resume option if you want to import from an existing template resume instead\./i,
      ),
    ).not.toBeInTheDocument();
  });

  it("shows the Reactive Resume success state in the detail panel after validation passes", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(validateAndMaybePersistRxResumeMode).mockResolvedValue({
      validation: {
        valid: true,
        message: null,
      },
    } as any);
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: false,
      message: "Choose a template resume to finish this step.",
    });

    renderPage();

    fireEvent.click(getStepButton(/^Resume$/i));
    fireEvent.click(screen.getByText("Use Reactive Resume"));

    await waitFor(() => {
      expect(
        screen.getByText("Reactive Resume connection verified."),
      ).toBeInTheDocument();
    });
  });

  it("shows the loaded resume success state in the detail panel", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
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

    renderPage();

    fireEvent.click(getStepButton(/^Resume$/i));

    await waitFor(() => {
      expect(
        screen.getByText("Your base resume is loaded and ready."),
      ).toBeInTheDocument();
    });
  });

  it("lets upload-only onboarding switch PDF rendering to LaTeX when RxResume is unavailable", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(validateAndMaybePersistRxResumeMode).mockResolvedValue({
      validation: {
        valid: false,
        message: "Reactive Resume is not configured",
      },
    } as any);
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: false,
      message: "Reactive Resume is not configured",
    });
    vi.mocked(api.validateResumeConfig)
      .mockResolvedValueOnce({
        valid: false,
        message: "No resume yet",
      })
      .mockResolvedValueOnce({
        valid: true,
        message: null,
      });
    vi.mocked(api.importDesignResumeFromFile).mockResolvedValue({
      id: "primary",
      title: "Taylor Resume",
      resumeJson: {} as any,
      revision: 1,
      sourceResumeId: null,
      sourceMode: null,
      importedAt: "2026-04-11T00:00:00.000Z",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
      assets: [],
    });
    vi.mocked(api.updateSettings).mockImplementation(async (update) => {
      currentSettings = {
        ...currentSettings,
        ...("pdfRenderer" in update
          ? {
              pdfRenderer: {
                value: update.pdfRenderer,
                default: "rxresume",
                override: null,
              },
            }
          : {}),
      };
      return currentSettings;
    });

    const { container } = renderPage();

    fireEvent.click(getStepButton(/^Resume$/i));

    await waitFor(() => {
      expect(
        screen.getByText("Import your current resume."),
      ).toBeInTheDocument();
    });

    const input = container.querySelector(
      'input[type="file"][accept*=".pdf"]',
    ) as HTMLInputElement | null;
    if (!input) {
      throw new Error("Expected resume upload input");
    }

    fireEvent.change(input, {
      target: {
        files: [
          new File(["resume"], "resume.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(api.importDesignResumeFromFile).toHaveBeenCalledWith({
        fileName: "resume.pdf",
        mediaType: "application/pdf",
        dataBase64: expect.any(String),
      });
    });

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        pdfRenderer: "latex",
      });
    });
  });

  it("marks the search terms step stale after the resume changes", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig)
      .mockResolvedValueOnce({
        valid: true,
        message: null,
      })
      .mockResolvedValueOnce({
        valid: true,
        message: null,
      });
    vi.mocked(api.importDesignResumeFromFile).mockResolvedValue({
      id: "primary",
      title: "Taylor Resume",
      resumeJson: {} as any,
      revision: 1,
      sourceResumeId: null,
      sourceMode: null,
      importedAt: "2026-04-11T00:00:00.000Z",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
      assets: [],
    });
    vi.mocked(api.updateSettings).mockImplementation(async (update) => {
      currentSettings = {
        ...currentSettings,
        ...("pdfRenderer" in update
          ? {
              pdfRenderer: {
                value: update.pdfRenderer,
                default: "rxresume",
                override: null,
              },
            }
          : {}),
      };
      return currentSettings;
    });

    const { container } = renderPage();

    fireEvent.click(getStepButton(/^Resume$/i));

    const input = container.querySelector(
      'input[type="file"][accept*=".pdf"]',
    ) as HTMLInputElement | null;
    if (!input) {
      throw new Error("Expected resume upload input");
    }

    fireEvent.change(input, {
      target: {
        files: [
          new File(["resume"], "resume.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(api.importDesignResumeFromFile).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: /search terms/i }));

    await waitFor(() => {
      expect(screen.getByText(/resume changed/i)).toBeInTheDocument();
    });
  });

  it("uses LaTeX for uploaded resumes even when Reactive Resume is available", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(validateAndMaybePersistRxResumeMode).mockResolvedValue({
      validation: {
        valid: true,
        message: null,
      },
    } as any);
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(api.validateResumeConfig)
      .mockResolvedValueOnce({
        valid: false,
        message: "No resume yet",
      })
      .mockResolvedValueOnce({
        valid: true,
        message: null,
      });
    vi.mocked(api.importDesignResumeFromFile).mockResolvedValue({
      id: "primary",
      title: "Taylor Resume",
      resumeJson: {} as any,
      revision: 1,
      sourceResumeId: null,
      sourceMode: null,
      importedAt: "2026-04-11T00:00:00.000Z",
      createdAt: "2026-04-11T00:00:00.000Z",
      updatedAt: "2026-04-11T00:00:00.000Z",
      assets: [],
    });
    vi.mocked(api.updateSettings).mockImplementation(async (update) => {
      currentSettings = {
        ...currentSettings,
        ...("pdfRenderer" in update
          ? {
              pdfRenderer: {
                value: update.pdfRenderer,
                default: "rxresume",
                override: null,
              },
            }
          : {}),
      };
      return currentSettings;
    });

    const { container } = renderPage();

    fireEvent.click(getStepButton(/^Resume$/i));

    const input = container.querySelector(
      'input[type="file"][accept*=".pdf"]',
    ) as HTMLInputElement | null;
    if (!input) {
      throw new Error("Expected resume upload input");
    }

    fireEvent.change(input, {
      target: {
        files: [
          new File(["resume"], "resume.pdf", {
            type: "application/pdf",
          }),
        ],
      },
    });

    await waitFor(() => {
      expect(api.updateSettings).toHaveBeenCalledWith({
        pdfRenderer: "latex",
      });
    });
  });

  it("only shows the template resume picker after Reactive Resume validates", async () => {
    currentSettings = {
      ...baseSettings,
      rxresumeApiKeyHint: null,
      rxresumeBaseResumeId: null,
      pdfRenderer: { value: "latex", default: "rxresume", override: null },
    };

    vi.mocked(useRxResumeConfigState).mockReturnValue({
      storedRxResume: {
        hasV5ApiKey: false,
        hasBaseUrl: true,
      },
      baseResumeId: null,
      syncBaseResumeId: () => null,
      getBaseResumeId: () => null,
      setBaseResumeId: vi.fn(),
    } as any);

    vi.mocked(api.validateLlm).mockResolvedValue({
      valid: true,
      message: null,
    });
    vi.mocked(validateAndMaybePersistRxResumeMode).mockImplementation(
      async ({ draft }) =>
        ({
          validation: {
            valid: Boolean(draft.apiKey),
            message: draft.apiKey ? null : "v5 API key required",
          },
        }) as any,
    );
    vi.mocked(api.validateResumeConfig).mockResolvedValue({
      valid: false,
      message: "Choose a template resume to finish this step.",
    });

    renderPage();

    fireEvent.click(getStepButton(/^Resume$/i));
    fireEvent.click(screen.getByText("Use Reactive Resume"));

    await waitFor(() => {
      expect(
        screen.getByText("Import your current resume."),
      ).toBeInTheDocument();
    });

    expect(screen.queryByText("Template resume")).not.toBeInTheDocument();
    expect(screen.queryByText("Base resume selection")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Enter v5 API key"), {
      target: { value: "rx-api-key" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /connect reactive resume/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Template resume")).toBeInTheDocument();
    });
    expect(screen.getByText("Base resume selection")).toBeInTheDocument();
  });

  it("lets the full authentication option card change the selection", async () => {
    vi.mocked(api.validateLlm).mockResolvedValue({
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

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: /basic auth/i }));

    await waitFor(() => {
      expect(screen.getByText("Secure your workspace")).toBeInTheDocument();
    });

    const skipCard = screen
      .getByText(/you can add authentication later from settings\./i)
      .closest("label");

    if (!skipCard) {
      throw new Error("Expected the skip card to render as a label");
    }

    fireEvent.click(skipCard);

    expect(
      screen.getByRole("button", { name: /finish onboarding/i }),
    ).toBeEnabled();
  });
});
