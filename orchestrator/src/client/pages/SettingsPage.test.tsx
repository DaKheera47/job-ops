import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"

import { SettingsPage } from "./SettingsPage"
import * as api from "../api"
import { toast } from "sonner"
import type { AppSettings } from "@shared/types"

vi.mock("../api", () => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  clearDatabase: vi.fn(),
  deleteJobsByStatus: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

const baseSettings: AppSettings = {
  model: "openai/gpt-4o-mini",
  defaultModel: "openai/gpt-4o-mini",
  overrideModel: null,
  modelScorer: "openai/gpt-4o-mini",
  overrideModelScorer: null,
  modelTailoring: "openai/gpt-4o-mini",
  overrideModelTailoring: null,
  modelProjectSelection: "openai/gpt-4o-mini",
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
}

const renderPage = () => {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <SettingsPage />
    </MemoryRouter>
  )
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("saves trimmed model overrides", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings)
    vi.mocked(api.updateSettings).mockResolvedValue({
      ...baseSettings,
      overrideModel: "gpt-4",
      model: "gpt-4",
    })

    renderPage()

    const modelTrigger = await screen.findByRole("button", { name: /model/i })
    fireEvent.click(modelTrigger)

    const modelField = screen.getByText("Override model").parentElement ?? screen.getByRole("main")
    const modelInput = within(modelField).getByRole("textbox")
    fireEvent.change(modelInput, { target: { value: "  gpt-4  " } })

    const saveButton = screen.getByRole("button", { name: /^save$/i })
    await waitFor(() => expect(saveButton).toBeEnabled())

    fireEvent.click(saveButton)

    await waitFor(() => expect(api.updateSettings).toHaveBeenCalled())
    expect(api.updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-4",
      })
    )
    expect(toast.success).toHaveBeenCalledWith("Settings saved")
  })

  it("clears jobs by status and summarizes results", async () => {
    vi.mocked(api.getSettings).mockResolvedValue(baseSettings)
    vi.mocked(api.deleteJobsByStatus).mockResolvedValue({ message: "", count: 2 })

    renderPage()

    const dangerTrigger = await screen.findByRole("button", { name: /danger zone/i })
    fireEvent.click(dangerTrigger)

    const clearSelectedButton = await screen.findByRole("button", { name: /clear selected/i })
    fireEvent.click(clearSelectedButton)

    const confirmButton = await screen.findByRole("button", { name: /clear 1 status/i })
    fireEvent.click(confirmButton)

    await waitFor(() => expect(api.deleteJobsByStatus).toHaveBeenCalledWith("discovered"))
    expect(toast.success).toHaveBeenCalledWith(
      "Jobs cleared",
      expect.objectContaining({
        description: "Deleted 2 jobs: 2 discovered",
      })
    )
  })
})
