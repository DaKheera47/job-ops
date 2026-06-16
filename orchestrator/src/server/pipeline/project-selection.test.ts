import { beforeEach, describe, expect, it, vi } from "vitest";
import * as jobsRepo from "../repositories/jobs";
import * as settingsRepo from "../repositories/settings";
import { getProfile } from "../services/profile";
import { pickProjectIdsForJob } from "../services/projectSelection";
import { summarizeJob } from "./orchestrator";

vi.mock("@infra/logger", () => {
  const logger = {
    child: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return { logger };
});

vi.mock("@infra/product-analytics", () => ({
  trackServerProductEvent: vi.fn(),
}));

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
  getAllSettings: vi.fn(),
}));

vi.mock("../services/pdf", () => ({
  generatePdf: vi.fn(),
}));

vi.mock("../services/pdf-fingerprint", () => ({
  createJobPdfFingerprint: vi.fn(),
  resolvePdfFingerprintContext: vi.fn(),
}));

vi.mock("../services/profile", () => ({
  getProfile: vi.fn(),
}));

vi.mock("../services/projectSelection", () => ({
  pickProjectIdsForJob: vi.fn(),
}));

vi.mock("../services/summary", () => ({
  generateTailoring: vi.fn(),
}));

vi.mock("./steps", () => ({
  discoverJobsStep: vi.fn(),
  importJobsStep: vi.fn(),
  loadProfileStep: vi.fn(),
  notifyPipelineWebhookStep: vi.fn(),
  processJobsStep: vi.fn(),
  scoreJobsStep: vi.fn(),
  selectJobsStep: vi.fn(),
}));

const profileWithProjects = {
  sections: {
    projects: {
      items: [
        {
          id: "mumtaz-urdu",
          name: "Mumtaz Urdu",
          summary: "Next.js education platform.",
          description: "",
          date: "",
          visible: false,
        },
        {
          id: "jobops",
          name: "JobOps",
          summary: "Job search automation app.",
          description: "",
          date: "",
          visible: false,
        },
        {
          id: "indus-marine",
          name: "Indus Marine Services",
          summary: "Induction platform.",
          description: "",
          date: "",
          visible: false,
        },
      ],
    },
  },
};

describe("summarizeJob project selection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(jobsRepo.getJobById).mockResolvedValue({
      id: "job-1",
      jobDescription: "Data acquisition engineer role.",
      tailoredSummary: "Existing summary.",
      tailoredHeadline: "Existing headline.",
      tailoredSkills: JSON.stringify(["TypeScript"]),
      selectedProjectIds: "mumtaz-urdu,jobops,indus-marine",
    } as any);
    vi.mocked(jobsRepo.updateJob).mockResolvedValue(undefined as any);
    vi.mocked(getProfile).mockResolvedValue(profileWithProjects as any);
    vi.mocked(settingsRepo.getSetting).mockImplementation(async (key) => {
      if (key !== "resumeProjects") return null;
      return JSON.stringify({
        maxProjects: 3,
        lockedProjectIds: [],
        aiSelectableProjectIds: ["mumtaz-urdu"],
      });
    });
    vi.mocked(pickProjectIdsForJob).mockResolvedValue(["mumtaz-urdu"]);
  });

  it("reselects stale saved projects using only the AI-selectable pool", async () => {
    const result = await summarizeJob("job-1");

    expect(result).toEqual({ success: true });
    expect(pickProjectIdsForJob).toHaveBeenCalledTimes(1);
    expect(pickProjectIdsForJob).toHaveBeenCalledWith(
      expect.objectContaining({
        desiredCount: 3,
        eligibleProjects: [
          expect.objectContaining({
            id: "mumtaz-urdu",
            name: "Mumtaz Urdu",
          }),
        ],
      }),
    );
    expect(jobsRepo.updateJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        selectedProjectIds: "mumtaz-urdu",
      }),
    );
  });
});
