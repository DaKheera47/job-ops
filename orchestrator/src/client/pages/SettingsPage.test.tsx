import type { AppSettings } from "@shared/types";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { SettingsPage } from "./SettingsPage";

vi.mock("../api", () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  clearDatabase: vi.fn(),
  deleteJobsByStatus: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

const baseSettings: AppSettings = {
  model: "google/gemini-3-flash-preview",
  defaultModel: "google/gemini-3-flash-preview",
  overrideModel: null,
  modelScorer: "google/gemini-3-flash-preview",
  overrideModelScorer: null,
  modelTailoring: "google/gemini-3-flash-preview",
  overrideModelTailoring: null,
  modelProjectSelection: "google/gemini-3-flash-preview",
  overrideModelProjectSelection: null,
  pipelineWebhookUrl: "",
  defaultPipelineWebhookUrl: "",
  overridePipelineWebhookUrl: null,
  jobCompleteWebhookUrl: "",
  defaultJobCompleteWebhookUrl: "",
  overrideJobCompleteWebhookUrl: null,
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
  resumeProjects: {
    maxProjects: 2,
    lockedProjectIds: [],
    aiSelectableProjectIds: ["proj-1", "proj-2"],
  },
  defaultResumeProjects: {
    maxProjects: 2,
    lockedProjectIds: [],
    aiSelectableProjectIds: ["proj-1", "proj-2"],
  },
  overrideResumeProjects: null,
  ukvisajobsMaxJobs: 50,
  defaultUkvisajobsMaxJobs: 50,
  overrideUkvisajobsMaxJobs: null,
  gradcrackerMaxJobsPerTerm: 50,
  defaultGradcrackerMaxJobsPerTerm: 50,
  overrideGradcrackerMaxJobsPerTerm: null,
  searchTerms: ["engineer"],
  defaultSearchTerms: ["engineer"],
  overrideSearchTerms: null,
  jobspyLocation: "UK",
  defaultJobspyLocation: "UK",
  overrideJobspyLocation: null,
  jobspyResultsWanted: 200,
  defaultJobspyResultsWanted: 200,
  overrideJobspyResultsWanted: null,
  jobspyHoursOld: 72,
  defaultJobspyHoursOld: 72,
  overrideJobspyHoursOld: null,
  jobspyCountryIndeed: "UK",
  defaultJobspyCountryIndeed: "UK",
  overrideJobspyCountryIndeed: null,
  jobspySites: ["indeed", "linkedin"],
  defaultJobspySites: ["indeed", "linkedin"],
  overrideJobspySites: null,
  jobspyLinkedinFetchDescription: true,
  defaultJobspyLinkedinFetchDescription: true,
  overrideJobspyLinkedinFetchDescription: null,
  showSponsorInfo: true,
  defaultShowSponsorInfo: true,
  overrideShowSponsorInfo: null,
  openrouterApiKeyHint: null,
  rxresumeEmail: "",
  rxresumePasswordHint: null,
  basicAuthUser: "",
  basicAuthPasswordHint: null,
  ukvisajobsEmail: "",
  ukvisajobsPasswordHint: null,
  webhookSecretHint: null,
  basicAuthActive: false,
  rxresumeBaseResumeId: null,
};

const renderPage = () => {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <SettingsPage />
    </MemoryRouter>,
  );
};

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves trimmed model overrides", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    vi.mocked(api.updateSettings).mockResolvedValue({
      ...baseSettings,
      overrideModel: "gpt-4",
      model: "gpt-4",
    });

    renderPage();

    const modelTrigger = await screen.findByRole("button", { name: /model/i });
    fireEvent.click(modelTrigger);

    const modelField =
      screen.getByText("Override model").parentElement ??
      screen.getByRole("main");
    const modelInput = within(modelField).getByRole("textbox");
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

    const modelTrigger = await screen.findByRole("button", { name: /model/i });
    fireEvent.click(modelTrigger);

    const modelField =
      screen.getByText("Override model").parentElement ??
      screen.getByRole("main");
    const modelInput = within(modelField).getByRole("textbox");

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

    const modelTrigger = await screen.findByRole("button", { name: /model/i });
    fireEvent.click(modelTrigger);
    const modelInput = screen.getByLabelText(/override model/i);
    fireEvent.change(modelInput, { target: { value: "new-model" } });
    expect(saveButton).toBeEnabled();
  });

  it("enables save button when numeric setting is changed", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings);
    renderPage();
    const saveButton = screen.getByRole("button", { name: /^save$/i });

    const visaTrigger = await screen.findByRole("button", {
      name: /ukvisajobs extractor/i,
    });
    fireEvent.click(visaTrigger);
    const maxJobsInput = screen.getByLabelText(/max jobs to fetch/i);
    fireEvent.change(maxJobsInput, { target: { value: "100" } });
    expect(saveButton).toBeEnabled();
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
    expect(saveButton).toBeEnabled();
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
});
