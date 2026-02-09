import { beforeEach, describe, expect, it, vi } from "vitest";
import * as jobsRepo from "../repositories/jobs";
import * as pdfService from "../services/pdf";
import * as settingsService from "../services/settings";
import { processJob } from "./orchestrator";

vi.mock("../repositories/jobs", () => ({
  getJobById: vi.fn(),
  updateJob: vi.fn(),
}));

vi.mock("../repositories/pipeline", () => ({
  createPipelineRun: vi.fn(),
  updatePipelineRun: vi.fn(),
}));

vi.mock("../repositories/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("../services/profile", () => ({
  getProfile: vi.fn().mockResolvedValue({}),
}));

vi.mock("../services/summary", () => ({
  generateTailoring: vi.fn(),
}));

vi.mock("../services/projectSelection", () => ({
  pickProjectIdsForJob: vi.fn(),
}));

vi.mock("../services/resumeProjects", () => ({
  extractProjectsFromProfile: vi.fn().mockReturnValue({
    catalog: [],
    selectionItems: [],
  }),
  resolveResumeProjectsSettings: vi.fn().mockReturnValue({
    resumeProjects: {
      maxProjects: 0,
      lockedProjectIds: [],
      aiSelectableProjectIds: [],
    },
  }),
}));

vi.mock("../services/settings", () => ({
  getEffectiveSettings: vi.fn(),
}));

vi.mock("../services/pdf", () => ({
  generatePdf: vi.fn(),
}));

const baseJob = {
  id: "job-1",
  status: "discovered",
  jobDescription: "Build backend systems",
  tailoredSummary: "Existing summary",
  tailoredHeadline: "Existing headline",
  tailoredSkills: JSON.stringify([{ name: "Core", keywords: ["TypeScript"] }]),
  selectedProjectIds: "proj-1",
  pdfPath: null,
};

describe("processJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jobsRepo.getJobById).mockResolvedValue(baseJob as any);
    vi.mocked(jobsRepo.updateJob).mockImplementation(async (id, changes) => {
      return { ...baseJob, id, ...(changes as object) } as any;
    });
  });

  it("marks a job as ready without PDF when PDF generation is disabled", async () => {
    vi.mocked(settingsService.getEffectiveSettings).mockResolvedValue({
      pdfGenerationEnabled: false,
    } as any);

    const result = await processJob("job-1");

    expect(result).toEqual({ success: true });
    expect(jobsRepo.updateJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        status: "ready",
        pdfPath: null,
      }),
    );
    expect(pdfService.generatePdf).not.toHaveBeenCalled();
  });

  it("continues to generate PDF when PDF generation is enabled", async () => {
    vi.mocked(settingsService.getEffectiveSettings).mockResolvedValue({
      pdfGenerationEnabled: true,
    } as any);
    vi.mocked(pdfService.generatePdf).mockResolvedValue({
      success: true,
      pdfPath: "pdfs/resume_job-1.pdf",
    });

    const result = await processJob("job-1");

    expect(result).toEqual({ success: true });
    expect(pdfService.generatePdf).toHaveBeenCalledTimes(1);
    expect(jobsRepo.updateJob).toHaveBeenCalledWith("job-1", {
      status: "processing",
    });
    expect(jobsRepo.updateJob).toHaveBeenCalledWith("job-1", {
      status: "ready",
      pdfPath: "pdfs/resume_job-1.pdf",
    });
  });
});
