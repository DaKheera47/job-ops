import { beforeEach, describe, expect, it, vi } from "vitest";

const stepState = vi.hoisted(() => {
  let resolveDiscover:
    | ((value: { discoveredJobs: []; sourceErrors: [] }) => void)
    | null = null;
  return {
    setResolver: (
      fn: (value: { discoveredJobs: []; sourceErrors: [] }) => void,
    ) => {
      resolveDiscover = fn;
    },
    resolveDiscover: () =>
      resolveDiscover?.({ discoveredJobs: [], sourceErrors: [] }),
  };
});

vi.mock("../repositories/pipeline", () => ({
  createPipelineRun: vi.fn(async () => ({
    id: "run-cancel-1",
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
  discoverJobsStep: vi.fn(
    () =>
      new Promise<{ discoveredJobs: []; sourceErrors: [] }>((resolve) => {
        stepState.setResolver(resolve);
      }),
  ),
  importJobsStep: vi.fn(async () => ({ created: 0, skipped: 0 })),
  scoreJobsStep: vi.fn(async () => ({ unprocessedJobs: [], scoredJobs: [] })),
  selectJobsStep: vi.fn(() => []),
  processJobsStep: vi.fn(async () => ({ processedCount: 0 })),
  notifyPipelineWebhookStep: vi.fn(async () => undefined),
}));

describe.sequential("pipeline cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks run as cancelled at checkpoint and resets running state", async () => {
    const pipeline = await import("./orchestrator");
    const pipelineRepo = await import("../repositories/pipeline");
    const steps = await import("./steps");

    const runPromise = pipeline.runPipeline({ sources: [] });

    await Promise.resolve();

    const cancelRequest = pipeline.requestPipelineCancel();
    expect(cancelRequest.accepted).toBe(true);
    expect([null, "run-cancel-1"]).toContain(cancelRequest.pipelineRunId);
    expect(pipeline.isPipelineCancelRequested()).toBe(true);

    const duplicateRequest = pipeline.requestPipelineCancel();
    expect(duplicateRequest.accepted).toBe(true);
    expect(duplicateRequest.alreadyRequested).toBe(true);

    stepState.resolveDiscover();
    const result = await runPromise;

    expect(result.success).toBe(false);
    expect(result.error).toContain("Cancelled");
    expect(vi.mocked(steps.importJobsStep)).not.toHaveBeenCalled();
    expect(vi.mocked(pipelineRepo.updatePipelineRun)).toHaveBeenCalledWith(
      "run-cancel-1",
      expect.objectContaining({
        status: "cancelled",
      }),
    );
    expect(pipeline.getPipelineStatus().isRunning).toBe(false);
    expect(pipeline.isPipelineCancelRequested()).toBe(false);
  });
});
