import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../repositories/pipeline", () => ({
  createPipelineRun: vi.fn(async () => ({
    id: "run-llm-config-1",
    startedAt: new Date().toISOString(),
    completedAt: null,
    status: "running",
    jobsDiscovered: 0,
    jobsProcessed: 0,
    errorMessage: null,
  })),
  updatePipelineRun: vi.fn(async () => undefined),
}));

const scoreJobsStep = vi.fn();

vi.mock("./steps", () => ({
  loadProfileStep: vi.fn(async () => ({})),
  discoverJobsStep: vi.fn(async () => ({
    discoveredJobs: [],
    sourceErrors: [],
    pendingChallenges: [],
  })),
  importJobsStep: vi.fn(async () => ({
    created: 0,
    skipped: 0,
    fuzzyMerged: 0,
  })),
  scoreJobsStep,
  selectJobsStep: vi.fn(() => []),
  processJobsStep: vi.fn(async () => ({ processedCount: 0 })),
  notifyPipelineWebhookStep: vi.fn(async () => undefined),
}));

describe.sequential("pipeline LLM configuration handling", () => {
  let tempDir: string;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-pipeline-llm-config-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";

    await import("../db/migrate");
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("re-enters configuration_required on every repeated scoring failure instead of failing", async () => {
    const { LlmNotConfiguredError } = await import("../services/scorer");

    scoreJobsStep
      .mockRejectedValueOnce(
        new LlmNotConfiguredError("LLM API key not configured"),
      )
      .mockRejectedValueOnce(
        new LlmNotConfiguredError("LLM API key not configured"),
      )
      .mockResolvedValueOnce({ unprocessedJobs: [], scoredJobs: [] });

    const pipeline = await import("./orchestrator");
    const pipelineRepo = await import("../repositories/pipeline");
    const { getProgress } = await import("./progress");

    const runPromise = pipeline.runPipeline({});

    // First failure: pipeline should pause for configuration, not fail.
    await vi.waitFor(() => {
      expect(getProgress().step).toBe("configuration_required");
    });
    expect(scoreJobsStep).toHaveBeenCalledTimes(1);
    expect(pipeline.resumePipelineScoring()).toEqual({ resolved: true });

    // Second failure: must ALSO pause for configuration again, not blow past
    // the catch and mark the pipeline failed.
    await vi.waitFor(() => {
      expect(scoreJobsStep).toHaveBeenCalledTimes(2);
    });
    await vi.waitFor(() => {
      expect(getProgress().step).toBe("configuration_required");
    });
    expect(pipeline.resumePipelineScoring()).toEqual({ resolved: true });

    const result = await runPromise;

    expect(scoreJobsStep).toHaveBeenCalledTimes(3);
    expect(result).toEqual(
      expect.objectContaining({ success: true, jobsProcessed: 0 }),
    );
    expect(vi.mocked(pipelineRepo.updatePipelineRun)).not.toHaveBeenCalledWith(
      "run-llm-config-1",
      expect.objectContaining({ status: "failed" }),
    );
    expect(vi.mocked(pipelineRepo.updatePipelineRun)).toHaveBeenCalledWith(
      "run-llm-config-1",
      expect.objectContaining({ status: "completed" }),
    );
  });
});
