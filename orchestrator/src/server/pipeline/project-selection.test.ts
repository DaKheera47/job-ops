import { beforeEach, describe, expect, it, vi } from "vitest";
import * as jobsRepo from "../repositories/jobs";
import * as settingsRepo from "../repositories/settings";
import { getProfile } from "../services/profile";
import { pickProjectIdsForJob } from "../services/projectSelection";
import { generateTailoring } from "../services/summary";
import { createTailoredResumeArtifact } from "../services/tailored-resume";
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
          id: "project-a",
          name: "Project A",
          summary: "Education platform.",
          description: "",
          date: "",
          visible: false,
        },
        {
          id: "project-b",
          name: "Project B",
          summary: "Workflow application.",
          description: "",
          date: "",
          visible: false,
        },
        {
          id: "project-c",
          name: "Project C",
          summary: "Data collection service.",
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
      selectedProjectIds: "project-a,project-b,project-c",
    } as any);
    vi.mocked(jobsRepo.updateJob).mockResolvedValue(undefined as any);
    vi.mocked(getProfile).mockResolvedValue(profileWithProjects as any);
    vi.mocked(generateTailoring).mockResolvedValue({
      success: true,
      data: {
        headline: "Existing headline.",
        summary: "Existing summary.",
        skills: [{ name: "Backend", keywords: ["TypeScript"] }],
        experience: [],
        projects: [{ id: "project-a", bullets: ["Education platform."] }],
      },
    });
    vi.mocked(settingsRepo.getSetting).mockImplementation(async (key) => {
      if (key !== "resumeProjects") return null;
      return JSON.stringify({
        maxProjects: 3,
        lockedProjectIds: [],
        aiSelectableProjectIds: ["project-a"],
      });
    });
    vi.mocked(pickProjectIdsForJob).mockResolvedValue(["project-a"]);
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
            id: "project-a",
            name: "Project A",
          }),
        ],
      }),
    );
    expect(generateTailoring).toHaveBeenCalledTimes(1);
    expect(jobsRepo.updateJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        selectedProjectIds: "project-a",
        tailoredResume: expect.any(String),
      }),
    );
  });

  it.each([
    ["malformed", "{"],
    [
      "stale",
      JSON.stringify(
        createTailoredResumeArtifact(
          {
            headline: "Existing headline.",
            summary: "Existing summary.",
            skills: [{ name: "Backend", keywords: ["TypeScript"] }],
            experience: [],
            projects: [],
          },
          profileWithProjects,
          "Old job description",
        ),
      ),
    ],
  ])("regenerates %s full-tailoring artifacts", async (_kind, artifact) => {
    vi.mocked(jobsRepo.getJobById).mockResolvedValue({
      id: "job-1",
      jobDescription: "Data acquisition engineer role.",
      tailoredSummary: "Existing summary.",
      tailoredHeadline: "Existing headline.",
      tailoredSkills: JSON.stringify(["TypeScript"]),
      tailoredResume: artifact,
      selectedProjectIds: "project-a",
    } as any);

    expect(await summarizeJob("job-1")).toEqual({ success: true });
    expect(generateTailoring).toHaveBeenCalledTimes(1);
  });

  it("does not replace bullet tailoring when regenerating one text field", async () => {
    expect(
      await summarizeJob("job-1", { force: true, fields: ["summary"] }),
    ).toEqual({ success: true });

    expect(generateTailoring).toHaveBeenCalledTimes(1);
    expect(pickProjectIdsForJob).not.toHaveBeenCalled();
    const update = vi.mocked(jobsRepo.updateJob).mock.calls[0]?.[1];
    expect(update).toEqual({ tailoredSummary: "Existing summary." });
    expect(update).not.toHaveProperty("tailoredResume");
  });

  it("reuses a current artifact unless tailoring is forced", async () => {
    const artifact = JSON.stringify(
      createTailoredResumeArtifact(
        {
          headline: "Existing headline.",
          summary: "Existing summary.",
          skills: [{ name: "Backend", keywords: ["TypeScript"] }],
          experience: [],
          projects: [],
        },
        profileWithProjects,
        "Data acquisition engineer role.",
      ),
    );
    vi.mocked(jobsRepo.getJobById).mockResolvedValue({
      id: "job-1",
      jobDescription: "Data acquisition engineer role.",
      tailoredSummary: "Existing summary.",
      tailoredHeadline: "Existing headline.",
      tailoredSkills: JSON.stringify(["TypeScript"]),
      tailoredResume: artifact,
      selectedProjectIds: "project-a",
    } as any);

    expect(await summarizeJob("job-1")).toEqual({ success: true });
    expect(generateTailoring).not.toHaveBeenCalled();

    expect(await summarizeJob("job-1", { force: true })).toEqual({
      success: true,
    });
    expect(generateTailoring).toHaveBeenCalledTimes(1);
  });
});
