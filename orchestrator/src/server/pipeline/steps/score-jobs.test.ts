import type { Job } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scoreJobsStep } from "./score-jobs";

vi.mock("@infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../repositories/jobs", () => ({
  getUnscoredDiscoveredJobs: vi.fn(),
  updateJob: vi.fn(),
}));

vi.mock("../../repositories/settings", () => ({
  getSetting: vi.fn(),
}));

vi.mock("../../services/scorer", () => ({
  scoreJobSuitability: vi.fn(),
}));

vi.mock("../../services/visa-sponsors/index", () => ({
  searchSponsors: vi.fn(),
  calculateSponsorMatchSummary: vi.fn(),
}));

vi.mock("../progress", () => ({
  updateProgress: vi.fn(),
  progressHelpers: {
    scoringJob: vi.fn(),
    scoringComplete: vi.fn(),
  },
}));

function createMockJob(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-1",
    title: "Software Engineer",
    employer: "Acme Corp",
    status: "discovered",
    suitabilityScore: null,
    suitabilityReason: null,
    ...overrides,
  } as Job;
}

describe("scoreJobsStep auto-skip behavior", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    const jobsRepo = await import("../../repositories/jobs");
    const settingsRepo = await import("../../repositories/settings");
    const scorer = await import("../../services/scorer");
    const visaSponsors = await import("../../services/visa-sponsors/index");

    vi.mocked(jobsRepo.getUnscoredDiscoveredJobs).mockResolvedValue([
      createMockJob(),
    ]);
    vi.mocked(jobsRepo.updateJob).mockResolvedValue(null);
    vi.mocked(settingsRepo.getSetting).mockResolvedValue(null);
    vi.mocked(scorer.scoreJobSuitability).mockResolvedValue({
      score: 40,
      reason: "Low fit",
    });
    vi.mocked(visaSponsors.searchSponsors).mockReturnValue([]);
    vi.mocked(visaSponsors.calculateSponsorMatchSummary).mockReturnValue({
      sponsorMatchScore: 0,
      sponsorMatchNames: null,
    });
  });

  it("auto-skips jobs when score is below threshold", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobsRepo = await import("../../repositories/jobs");
    const { logger } = await import("@infra/logger");

    vi.mocked(settingsRepo.getSetting).mockResolvedValue("50");

    await scoreJobsStep({ profile: {} });

    expect(jobsRepo.updateJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        suitabilityScore: 40,
        status: "skipped",
      }),
    );
    expect(logger.info).toHaveBeenCalledWith(
      "Auto-skipped job due to low score",
      expect.objectContaining({
        jobId: "job-1",
        score: 40,
        threshold: 50,
      }),
    );
  });

  it("does not auto-skip jobs when score equals threshold", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobsRepo = await import("../../repositories/jobs");
    const scorer = await import("../../services/scorer");
    const { logger } = await import("@infra/logger");

    vi.mocked(settingsRepo.getSetting).mockResolvedValue("50");
    vi.mocked(scorer.scoreJobSuitability).mockResolvedValue({
      score: 50,
      reason: "At threshold",
    });

    await scoreJobsStep({ profile: {} });

    expect(jobsRepo.updateJob).toHaveBeenCalledWith(
      "job-1",
      expect.objectContaining({
        suitabilityScore: 50,
      }),
    );
    const updatePayload = vi.mocked(jobsRepo.updateJob).mock.calls[0][1] as {
      status?: string;
    };
    expect(updatePayload).not.toHaveProperty("status");
    expect(logger.info).not.toHaveBeenCalledWith(
      "Auto-skipped job due to low score",
      expect.anything(),
    );
  });

  it("does not auto-skip when threshold setting is null", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobsRepo = await import("../../repositories/jobs");

    vi.mocked(settingsRepo.getSetting).mockResolvedValue(null);

    await scoreJobsStep({ profile: {} });

    const updatePayload = vi.mocked(jobsRepo.updateJob).mock.calls[0][1] as {
      status?: string;
    };
    expect(updatePayload).not.toHaveProperty("status");
  });

  it("does not auto-skip when threshold setting is NaN", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobsRepo = await import("../../repositories/jobs");

    vi.mocked(settingsRepo.getSetting).mockResolvedValue("not-a-number");

    await scoreJobsStep({ profile: {} });

    const updatePayload = vi.mocked(jobsRepo.updateJob).mock.calls[0][1] as {
      status?: string;
    };
    expect(updatePayload).not.toHaveProperty("status");
  });

  it("never auto-skips applied jobs even when score is below threshold", async () => {
    const settingsRepo = await import("../../repositories/settings");
    const jobsRepo = await import("../../repositories/jobs");
    const { logger } = await import("@infra/logger");

    vi.mocked(settingsRepo.getSetting).mockResolvedValue("50");
    vi.mocked(jobsRepo.getUnscoredDiscoveredJobs).mockResolvedValue([
      createMockJob({ id: "job-applied", status: "applied" }),
    ]);

    await scoreJobsStep({ profile: {} });

    expect(jobsRepo.updateJob).toHaveBeenCalledWith(
      "job-applied",
      expect.any(Object),
    );
    const updatePayload = vi.mocked(jobsRepo.updateJob).mock.calls[0][1] as {
      status?: string;
    };
    expect(updatePayload).not.toHaveProperty("status");
    expect(logger.info).not.toHaveBeenCalledWith(
      "Auto-skipped job due to low score",
      expect.objectContaining({ jobId: "job-applied" }),
    );
  });
});
