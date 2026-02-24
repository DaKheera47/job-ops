import { createAppSettings } from "@shared/testing/factories.js";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { _resetTracerReadinessCache } from "../hooks/useTracerReadiness";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { SettingsPage } from "./SettingsPage";

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

vi.mock("../api", () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  validateRxresume: vi.fn(),
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

const openModelSection = async () => {
  const modelTrigger = await screen.findByRole("button", { name: /^model$/i });
  fireEvent.click(modelTrigger);
};

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    const saveButton = screen.getByRole("button", { name: /^save$/i });
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
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();
  });

  it("clears jobs by status and summarizes results", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.deleteJobsByStatus).mockResolvedValue({
      message: "",
      count: 2,
    });

    renderPage();

    const dangerTrigger = await screen.findByRole("button", {
      name: /danger zone/i,
    });
    fireEvent.click(dangerTrigger);

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
    const saveButton = screen.getByRole("button", { name: /^save$/i });
    expect(saveButton).toBeDisabled();
    await openModelSection();

    const modelInput = screen.getByLabelText(/default model/i);
    // Wait for the query to resolve and input to be enabled
    await waitFor(() => expect(modelInput).toBeEnabled());

    fireEvent.change(modelInput, { target: { value: "new-model" } });
    await waitFor(() => expect(saveButton).toBeEnabled());
  });

  it("hides pipeline tuning sections that moved to run modal", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    renderPage();

    await screen.findByRole("button", { name: /model/i });
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
    const saveButton = screen.getByRole("button", { name: /^save$/i });

    const displayTrigger = await screen.findByRole("button", {
      name: /display settings/i,
    });
    fireEvent.click(displayTrigger);
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

    const displayTrigger = await screen.findByRole("button", {
      name: /display settings/i,
    });
    fireEvent.click(displayTrigger);
    const sponsorCheckbox = screen.getByLabelText(
      /show visa sponsor information/i,
    );
    fireEvent.click(sponsorCheckbox);

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(toast.error).not.toHaveBeenCalledWith(
      "Choose one Reactive Resume auth method",
      expect.anything(),
    );
  });

  it("enables save button when basic auth toggle is changed", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    renderPage();
    const saveButton = screen.getByRole("button", { name: /^save$/i });

    const envTrigger = await screen.findByRole("button", {
      name: /environment & accounts/i,
    });
    fireEvent.click(envTrigger);
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

    const envTrigger = await screen.findByRole("button", {
      name: /environment & accounts/i,
    });
    fireEvent.click(envTrigger);

    const authCheckbox = screen.getByLabelText(/enable basic authentication/i);
    expect(authCheckbox).toBeChecked();

    // Disable it
    fireEvent.click(authCheckbox);
    expect(authCheckbox).not.toBeChecked();

    const saveButton = screen.getByRole("button", { name: /^save$/i });
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

    const scoringTrigger = await screen.findByRole("button", {
      name: /scoring settings/i,
    });
    fireEvent.click(scoringTrigger);

    const input = screen.getByPlaceholderText('e.g. "recruitment", "staffing"');
    fireEvent.change(input, { target: { value: "staffing" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const saveButton = screen.getByRole("button", { name: /^save$/i });
    await waitFor(() => expect(saveButton).toBeEnabled());
    fireEvent.click(saveButton);

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled());
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        blockedCompanyKeywords: ["staffing"],
      }),
    );
  });
});
