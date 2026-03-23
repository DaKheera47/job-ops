import { getDefaultPromptTemplate } from "@shared/prompt-template-definitions.js";
import { createAppSettings } from "@shared/testing/factories.js";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { _resetTracerReadinessCache } from "../hooks/useTracerReadiness";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { SettingsPage } from "./SettingsPage";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

vi.mock("../api", () => ({
  getSettings: vi.fn(),
  getLlmModels: vi.fn().mockResolvedValue([]),
  updateSettings: vi.fn(),
  validateRxresume: vi.fn(),
  getRxResumeProjects: vi.fn(),
  clearDatabase: vi.fn(),
  deleteJobsByStatus: vi.fn(),
  getTracerReadiness: vi.fn(),
  getBackups: vi.fn().mockResolvedValue({ backups: [], nextScheduled: null }),
  createManualBackup: vi.fn(),
  deleteBackup: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const baseSettings = createAppSettings({
  profileProjects: [
    {
      id: "proj-1",
      name: "Project One",
      description: "Desc 1",
      date: "2024",
      isVisibleInBase: true,
    },
    {
      id: "proj-2",
      name: "Project Two",
      description: "Desc 2",
      date: "2023",
      isVisibleInBase: false,
    },
  ],
});

const renderPage = () => {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <SettingsPage />
    </MemoryRouter>,
  );
};

const getSaveButton = () =>
  screen.getByRole("button", { name: /save changes/i });

const openNavGroup = async (name: RegExp) => {
  const groupButton = await screen.findByRole("button", { name });
  fireEvent.click(groupButton);
};

const clickLastButtonByName = async (name: RegExp) => {
  const buttons = await screen.findAllByRole("button", { name });
  const target = buttons.at(-1);
  expect(target).toBeDefined();
  fireEvent.click(target as HTMLElement);
};

const openModelSection = async () => {
  await openNavGroup(/^ai$/i);
  await clickLastButtonByName(/models/i);
};

const openWritingStyleSection = async () => {
  await openNavGroup(/^ai$/i);
  await clickLastButtonByName(/writing style/i);
};

const openPromptTemplatesSection = async () => {
  await openNavGroup(/^ai$/i);
  await clickLastButtonByName(/prompt templates/i);
};

const openReactiveResumeSection = async () => {
  await openNavGroup(/^integrations$/i);
  await clickLastButtonByName(/reactive resume/i);
};

const openDisplaySection = async () => {
  await openNavGroup(/^display$/i);
  await clickLastButtonByName(/display preferences/i);
};

const openEnvironmentSection = async () => {
  await openNavGroup(/^accounts & security$/i);
  await clickLastButtonByName(/accounts & access/i);
};

const openScoringSection = async () => {
  await openNavGroup(/^scoring$/i);
  await clickLastButtonByName(/rules.*filters/i);
};

const openDangerZoneSection = async () => {
  await openNavGroup(/^danger zone$/i);
  await clickLastButtonByName(/danger zone/i);
};

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    _resetTracerReadinessCache();
    vi.mocked(api.getTracerReadiness).mockResolvedValue({
      status: "ready",
      canEnable: true,
      publicBaseUrl: "https://my-jobops.example.com",
      healthUrl: "https://my-jobops.example.com/health",
      checkedAt: Date.now(),
      lastSuccessAt: Date.now(),
      reason: null,
    });
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: false,
      message: "Missing credentials",
      status: 400,
    });
  });

  afterAll(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
    });
  });

  it("saves trimmed model overrides", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.updateSettings).mockResolvedValue({
      ...baseSettings,
      model: {
        value: "gpt-4",
        default: baseSettings.model.default,
        override: "gpt-4",
      },
    });

    renderPage();
    await openModelSection();

    const modelInput = screen.getByLabelText(/default model/i);
    await waitFor(() => expect(modelInput).toBeEnabled());
    fireEvent.change(modelInput, { target: { value: "  gpt-4  " } });

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());

    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Settings saved");
  });

  it("shows validation error for too long model override", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);

    renderPage();
    await openModelSection();

    const modelInput = screen.getByLabelText(/default model/i);
    await waitFor(() => expect(modelInput).toBeEnabled());

    // Change to > 200 chars
    fireEvent.change(modelInput, { target: { value: "a".repeat(201) } });

    // Should see error message
    expect(
      await screen.findByText(
        /String must contain at most 200 character\(s\)/i,
      ),
    ).toBeInTheDocument();

    // Save button should be disabled due to validation error (isValid will be false)
    const saveButton = getSaveButton();
    expect(saveButton).toBeDisabled();
  });

  it("clears jobs by status and summarizes results", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.deleteJobsByStatus).mockResolvedValue({
      message: "",
      count: 2,
    });

    renderPage();

    await openDangerZoneSection();

    const clearSelectedButton = await screen.findByRole("button", {
      name: /clear selected/i,
    });
    fireEvent.click(clearSelectedButton);

    const confirmButton = await screen.findByRole("button", {
      name: /clear 1 status/i,
    });
    fireEvent.click(confirmButton);

    await waitFor(() =>
      expect(api.deleteJobsByStatus).toHaveBeenCalledWith("discovered"),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Jobs cleared",
      expect.objectContaining({
        description: "Deleted 2 jobs: 2 discovered",
      }),
    );
  });

  it("enables save button when model is changed", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    renderPage();
    const saveButton = getSaveButton();
    expect(saveButton).toBeDisabled();
    await openModelSection();

    const modelInput = screen.getByLabelText(/default model/i);
    // Wait for the query to resolve and input to be enabled
    await waitFor(() => expect(modelInput).toBeEnabled());

    fireEvent.change(modelInput, { target: { value: "new-model" } });
    await waitFor(() => expect(saveButton).toBeEnabled());
  });

  it("clears stale model overrides when the provider changes", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(
      createAppSettings({
        model: {
          value: "google/gemini-3-flash-preview",
          default: "google/gemini-3-flash-preview",
          override: "google/gemini-3-flash-preview",
        },
        modelScorer: { value: "google/gemini-3-flash-preview", override: null },
        modelTailoring: {
          value: "google/gemini-3-flash-preview",
          override: "google/gemini-3-flash-preview",
        },
        modelProjectSelection: {
          value: "google/gemini-3-flash-preview",
          override: null,
        },
        llmProvider: { value: "gemini", default: "gemini", override: "gemini" },
      }),
    );
    vi.mocked(api.updateSettings).mockResolvedValue(baseSettings);

    renderPage();
    await openModelSection();

    fireEvent.click(screen.getByRole("combobox", { name: /provider/i }));
    fireEvent.click(await screen.findByText("OpenAI"));

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        llmProvider: "openai",
        model: null,
        modelScorer: null,
        modelTailoring: null,
        modelProjectSelection: null,
      }),
    );
  });

  it("hides pipeline tuning sections that moved to run modal", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    renderPage();

    await openModelSection();
    expect(
      screen.queryByRole("button", { name: /ukvisajobs extractor/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /gradcracker extractor/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /search terms/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /jobspy scraper/i }),
    ).not.toBeInTheDocument();
  });

  it("enables save button when display setting is changed", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    renderPage();
    const saveButton = getSaveButton();

    await openDisplaySection();
    const sponsorCheckbox = screen.getByLabelText(
      /show visa sponsor information/i,
    );
    fireEvent.click(sponsorCheckbox);
    await waitFor(() => expect(saveButton).toBeEnabled());
  });

  it("allows saving when both Reactive Resume v4 and v5 credentials are present", async () => {
    const settingsWithBothRxResumeAuth = createAppSettings({
      rxresumeEmail: "resume@example.com",
      rxresumePasswordHint: "pass",
      rxresumeApiKeyHint: "api_",
    });
    vi.mocked(api.getSettings).mockResolvedValue(settingsWithBothRxResumeAuth);
    vi.mocked(api.updateSettings).mockResolvedValue(
      settingsWithBothRxResumeAuth,
    );

    renderPage();

    await openDisplaySection();
    const sponsorCheckbox = screen.getByLabelText(
      /show visa sponsor information/i,
    );
    fireEvent.click(sponsorCheckbox);

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith(
      "Choose one Reactive Resume auth method",
      expect.anything(),
    );
  });

  it("saves a shared RxResume URL from the Reactive Resume section", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.updateSettings).mockResolvedValue({
      ...baseSettings,
      rxresumeUrl: "https://resume.example.com",
    });

    renderPage();

    await openReactiveResumeSection();
    const urlInput = screen.getByLabelText(/rxresume url/i);
    await waitFor(() => expect(urlInput).toBeEnabled());
    fireEvent.change(urlInput, {
      target: { value: "https://resume.example.com" },
    });

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        rxresumeUrl: "https://resume.example.com",
      }),
    );
  });

  it("blocks save and renders an inline alert when the v5 API key is invalid", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);

    renderPage();
    await openReactiveResumeSection();

    await waitFor(() => expect(api.validateRxresume).toHaveBeenCalled());
    vi.mocked(api.validateRxresume).mockClear();
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: false,
      message:
        "Reactive Resume v5 API key is invalid. Update the API key and try again.",
      status: 401,
    });

    fireEvent.change(screen.getByLabelText(/v5 api key/i), {
      target: { value: "invalid-v5-key" },
    });

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    expect(
      await screen.findByText(/Reactive Resume v5 API key is invalid/i),
    ).toBeInTheDocument();
    expect(api.updateSettings).not.toHaveBeenCalled();
  });

  it("allows saving on RxResume availability warnings and keeps the inline warning visible", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.updateSettings).mockResolvedValue({
      ...baseSettings,
      rxresumeApiKeyHint: "rr-v",
    });

    renderPage();
    await openReactiveResumeSection();

    await waitFor(() => expect(api.validateRxresume).toHaveBeenCalled());
    vi.mocked(api.validateRxresume).mockClear();
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: false,
      message:
        "JobOps could not verify Reactive Resume because the instance is unavailable right now.",
      status: 0,
    });

    fireEvent.change(screen.getByLabelText(/v5 api key/i), {
      target: { value: "rr-v5-warning-key" },
    });

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(
      await screen.findByText(/instance is unavailable right now/i),
    ).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith("Settings saved");
    expect(toast.info).toHaveBeenCalledWith(
      "Settings saved, but JobOps could not verify Reactive Resume because the instance is unavailable.",
    );
  });

  it("does not run RxResume validation for unrelated settings saves", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.updateSettings).mockResolvedValue({
      ...baseSettings,
      model: {
        value: "new-model",
        default: baseSettings.model.default,
        override: "new-model",
      },
    });

    renderPage();
    await openModelSection();
    await waitFor(() => expect(api.validateRxresume).toHaveBeenCalled());
    vi.mocked(api.validateRxresume).mockClear();

    fireEvent.change(screen.getByLabelText(/default model/i), {
      target: { value: "new-model" },
    });

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.validateRxresume).not.toHaveBeenCalled();
  });

  it("clears the previous RxResume warning when the key or URL changes", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.validateRxresume).mockResolvedValue({
      valid: false,
      message:
        "JobOps could not verify Reactive Resume because the instance is unavailable right now.",
      status: 0,
    });

    renderPage();
    await openReactiveResumeSection();

    expect(
      await screen.findByText(/instance is unavailable right now/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/rxresume url/i), {
      target: { value: "https://resume.example.com" },
    });

    await waitFor(() =>
      expect(
        screen.queryByText(/instance is unavailable right now/i),
      ).not.toBeInTheDocument(),
    );
  });

  it("saves the writing language mode through the settings page", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.updateSettings).mockResolvedValue(
      createAppSettings({
        chatStyleLanguageMode: {
          value: "match-resume",
          default: "manual",
          override: "match-resume",
        },
      }),
    );

    renderPage();
    await openWritingStyleSection();

    fireEvent.click(screen.getByRole("combobox", { name: /output language/i }));
    fireEvent.click(await screen.findByText("Match current resume language"));

    expect(
      screen.queryByRole("combobox", { name: /specific language/i }),
    ).not.toBeInTheDocument();

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        chatStyleLanguageMode: "match-resume",
        chatStyleManualLanguage: null,
      }),
    );
  });

  it("enables save button when basic auth toggle is changed", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    renderPage();
    const saveButton = getSaveButton();

    await openEnvironmentSection();
    const authCheckbox = screen.getByLabelText(/enable basic authentication/i);
    fireEvent.click(authCheckbox);
    expect(saveButton).toBeEnabled();
  });

  it("wipes basic auth credentials when toggle is disabled and saved", async () => {
    // Initial state: Basic Auth is active
    const activeSettings = {
      ...baseSettings,
      basicAuthActive: true,
      basicAuthUser: "admin",
      basicAuthPasswordHint: "pass",
    };
    vi.mocked(api.getSettings).mockResolvedValue(activeSettings);
    vi.mocked(api.updateSettings).mockResolvedValue(baseSettings);

    renderPage();

    await openEnvironmentSection();

    const authCheckbox = screen.getByLabelText(/enable basic authentication/i);
    expect(authCheckbox).toBeChecked();

    // Disable it
    fireEvent.click(authCheckbox);
    expect(authCheckbox).not.toBeChecked();

    const saveButton = getSaveButton();
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        basicAuthUser: null,
        basicAuthPassword: null,
      }),
    );
  });

  it("saves blocked company keywords from scoring settings", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.updateSettings).mockResolvedValue({
      ...baseSettings,
      blockedCompanyKeywords: {
        value: ["staffing"],
        default: [],
        override: ["staffing"],
      },
    });

    renderPage();

    await openScoringSection();

    const input = screen.getByPlaceholderText('e.g. "recruitment", "staffing"');
    fireEvent.change(input, { target: { value: "staffing" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        blockedCompanyKeywords: ["staffing"],
      }),
    );
  });

  it("sends null for both numeric limit fields on reset-to-default", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(
      createAppSettings({
        chatStyleSummaryMaxWords: {
          value: 35,
          default: null,
          override: 35,
        },
        chatStyleMaxKeywordsPerSkill: {
          value: 8,
          default: null,
          override: 8,
        },
      }),
    );
    vi.mocked(api.updateSettings).mockResolvedValue(baseSettings);

    renderPage();

    const resetButton = await screen.findByRole("button", {
      name: /reset to default/i,
    });
    fireEvent.click(resetButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        chatStyleSummaryMaxWords: null,
        chatStyleMaxKeywordsPerSkill: null,
      }),
    );
  });

  it("saves scoring instructions from scoring settings", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.updateSettings).mockResolvedValue({
      ...baseSettings,
      scoringInstructions: {
        value:
          "Open to relocating, so do not mark down for location discrepancies.",
        default: "",
        override:
          "Open to relocating, so do not mark down for location discrepancies.",
      },
    });

    renderPage();

    await openScoringSection();

    const textarea = screen.getByLabelText(/scoring instructions/i);
    fireEvent.change(textarea, {
      target: {
        value:
          "Open to relocating, so do not mark down for location discrepancies.",
      },
    });

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        scoringInstructions:
          "Open to relocating, so do not mark down for location discrepancies.",
      }),
    );
  });

  it("serializes prompt templates back to null when reset to defaults", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(
      createAppSettings({
        ghostwriterSystemPromptTemplate: {
          value: "Custom Ghostwriter",
          default: getDefaultPromptTemplate("ghostwriterSystemPromptTemplate"),
          override: "Custom Ghostwriter",
        },
      }),
    );
    vi.mocked(api.updateSettings).mockResolvedValue(baseSettings);

    renderPage();

    await openPromptTemplatesSection();

    fireEvent.click(screen.getAllByRole("button", { name: /^reset$/i })[0]);

    const saveButton = getSaveButton();
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        ghostwriterSystemPromptTemplate: null,
      }),
    );
  });
});
