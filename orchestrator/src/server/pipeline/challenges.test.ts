import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const challenge = {
  extractorId: "gradcracker",
  extractorName: "Gradcracker",
  url: "https://www.gradcracker.com/search/computing-technology/software-developer-graduate-jobs-in-london-and-south-east?order=dateAdded",
  sources: ["gradcracker"],
};

vi.mock("../repositories/pipeline", () => ({
  createPipelineRun: vi.fn(async () => ({
    id: "run-challenge-1",
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    jobsDiscovered: 0,
    jobsProcessed: 0,
    errorMessage: null,
  })),
  updatePipelineRun: vi.fn(async () => undefined),
}));

vi.mock("./steps", () => ({
  loadProfileStep: vi.fn(async () => ({})),
  discoverJobsStep: vi.fn(async () => ({
    discoveredJobs: [],
    sourceErrors: [
      "Gradcracker: Cloudflare challenge required for https://www.gradcracker.com/search/computing-technology/software-developer-graduate-jobs-in-london-and-south-east?order=dateAdded (sources: gradcracker)",
    ],
    pendingChallenges: [challenge],
  })),
  importJobsStep: vi.fn(async () => ({
    created: 0,
    skipped: 0,
    fuzzyMerged: 0,
  })),
  scoreJobsStep: vi.fn(async () => ({ unprocessedJobs: [], scoredJobs: [] })),
  selectJobsStep: vi.fn(() => []),
  processJobsStep: vi.fn(async () => ({ processedCount: 0 })),
  notifyPipelineWebhookStep: vi.fn(async () => undefined),
}));

describe.sequential("pipeline challenge handling", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-pipeline-challenge-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";

    await import("../db/migrate");
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("fails loudly when a solved challenge immediately reappears with no jobs", async () => {
    const pipeline = await import("./orchestrator");
    const pipelineRepo = await import("../repositories/pipeline");
    const steps = await import("./steps");

    const runPromise = pipeline.runPipeline({
      sources: ["gradcracker"],
      locationIntent: {
        selectedCountry: "united kingdom",
        country: "united kingdom",
        cityLocations: [],
        workplaceTypes: [],
        geoScope: "selected_only",
        searchScope: "selected_only",
        matchStrictness: "flexible",
      },
    });

    await vi.waitFor(() => {
      expect(pipeline.getPendingChallenges()).toHaveLength(1);
    });

    expect(pipeline.resolvePipelineChallenge("gradcracker")).toEqual({
      resolved: true,
      remaining: 0,
    });

    const result = await runPromise;

    expect(result).toEqual(
      expect.objectContaining({
        success: false,
        jobsDiscovered: 0,
        jobsProcessed: 0,
        error: expect.stringContaining(
          "still returned a Cloudflare challenge after the solve step",
        ),
      }),
    );
    expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(steps.importJobsStep)).not.toHaveBeenCalled();
    expect(vi.mocked(pipelineRepo.updatePipelineRun)).toHaveBeenCalledWith(
      "run-challenge-1",
      expect.objectContaining({
        status: "failed",
        errorMessage: expect.stringContaining(
          "still returned a Cloudflare challenge after the solve step",
        ),
      }),
    );
  });
});
