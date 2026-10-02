import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const challenge = {
  extractorId: "gradcracker",
  extractorName: "Gradcracker",
  url: "https://www.gradcracker.com/search/computing-technology/software-developer-graduate-jobs-in-london-and-south-east?order=dateAdded",
  sources: ["gradcracker" as const],
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

  it("holds partial Hiring Cafe jobs until solve, retries the detail URL, and imports the enriched job", async () => {
    const pipeline = await import("./orchestrator");
    const steps = await import("./steps");
    const { runWithRequestContext } = await import("@infra/request-context");
    const partialJob = {
      source: "hiringcafe",
      sourceJobId: "req-1",
      title: "Engineer",
      employer: "Acme",
      jobUrl: "https://hiringcafe.com/job/req-1",
      jobDescription: "Listing summary",
    };
    const detailChallenge = {
      extractorId: "hiringcafe",
      extractorName: "Hiring Cafe",
      url: "https://hiringcafe.com/job/req-1",
      sources: ["hiringcafe" as const],
      pauseOnRepeat: true,
    };
    vi.mocked(steps.discoverJobsStep)
      .mockReset()
      .mockResolvedValueOnce({
        discoveredJobs: [partialJob],
        sourceErrors: ["Hiring Cafe detail challenged (HTTP 403)"],
        pendingChallenges: [detailChallenge],
      })
      .mockResolvedValueOnce({
        discoveredJobs: [
          { ...partialJob, jobDescription: "Full detail description" },
        ],
        sourceErrors: [],
        pendingChallenges: [],
      });

    const inTenantA = <T>(run: () => T) =>
      runWithRequestContext(
        { requestId: "request-a", tenantId: "tenant-a" },
        run,
      );
    const inTenantB = <T>(run: () => T) =>
      runWithRequestContext(
        { requestId: "request-b", tenantId: "tenant-b" },
        run,
      );
    const runPromise = inTenantA(() =>
      pipeline.runPipeline({ sources: ["hiringcafe"] }),
    );

    await vi.waitFor(() => {
      expect(inTenantA(() => pipeline.getPendingChallenges())).toHaveLength(1);
    });
    expect(vi.mocked(steps.importJobsStep)).not.toHaveBeenCalled();
    expect(inTenantB(() => pipeline.getPendingChallenges())).toEqual([]);
    expect(
      inTenantB(() => pipeline.resolvePipelineChallenge("hiringcafe")),
    ).toEqual({
      resolved: false,
      remaining: 0,
    });

    expect(
      inTenantA(() => pipeline.resolvePipelineChallenge("hiringcafe")),
    ).toEqual({
      resolved: true,
      remaining: 0,
    });
    await runPromise;

    expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        retryChallengeUrls: {
          hiringcafe: "https://hiringcafe.com/job/req-1",
        },
      }),
    );
    expect(vi.mocked(steps.importJobsStep)).toHaveBeenCalledWith({
      discoveredJobs: [
        expect.objectContaining({
          sourceJobId: "req-1",
          jobDescription: "Full detail description",
        }),
      ],
    });
  });

  it("pauses again without importing partial jobs when a detail challenge returns after the solve", async () => {
    const pipeline = await import("./orchestrator");
    const steps = await import("./steps");
    const partialJob = {
      source: "hiringcafe",
      sourceJobId: "req-1",
      title: "Engineer",
      employer: "Acme",
      jobUrl: "https://hiringcafe.com/job/req-1",
      jobDescription: "Listing summary",
    };
    const detailChallenge = {
      extractorId: "hiringcafe",
      extractorName: "Hiring Cafe",
      url: "https://hiringcafe.com/job/req-1",
      sources: ["hiringcafe" as const],
      pauseOnRepeat: true,
    };
    vi.mocked(steps.discoverJobsStep)
      .mockReset()
      .mockResolvedValueOnce({
        discoveredJobs: [partialJob],
        sourceErrors: [],
        pendingChallenges: [detailChallenge],
      })
      .mockResolvedValueOnce({
        discoveredJobs: [partialJob],
        sourceErrors: [],
        pendingChallenges: [detailChallenge],
      })
      .mockResolvedValueOnce({
        discoveredJobs: [
          { ...partialJob, jobDescription: "Full detail description" },
        ],
        sourceErrors: [],
        pendingChallenges: [],
      });

    const runPromise = pipeline.runPipeline({ sources: ["hiringcafe"] });
    await vi.waitFor(() => {
      expect(pipeline.getPendingChallenges()).toHaveLength(1);
    });
    pipeline.resolvePipelineChallenge("hiringcafe");

    await vi.waitFor(() => {
      expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenCalledTimes(2);
      expect(pipeline.getPendingChallenges()).toHaveLength(1);
    });
    expect(vi.mocked(steps.importJobsStep)).not.toHaveBeenCalled();
    pipeline.resolvePipelineChallenge("hiringcafe");

    const result = await runPromise;
    expect(result).toMatchObject({ success: true });
    expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(steps.importJobsStep)).toHaveBeenCalledWith({
      discoveredJobs: [
        expect.objectContaining({ jobDescription: "Full detail description" }),
      ],
    });
  });

  it("fails an ordinary repeated challenge even when Hiring Cafe is also paused", async () => {
    const pipeline = await import("./orchestrator");
    const steps = await import("./steps");
    const partialJob = {
      source: "hiringcafe" as const,
      sourceJobId: "req-1",
      title: "Engineer",
      employer: "Acme",
      jobUrl: "https://hiringcafe.com/job/req-1",
      jobDescription: "Listing summary",
    };
    const detailChallenge = {
      extractorId: "hiringcafe",
      extractorName: "Hiring Cafe",
      url: "https://hiringcafe.com/job/req-1",
      sources: ["hiringcafe" as const],
      pauseOnRepeat: true,
    };
    vi.mocked(steps.discoverJobsStep)
      .mockReset()
      .mockResolvedValueOnce({
        discoveredJobs: [partialJob],
        sourceErrors: [],
        pendingChallenges: [detailChallenge, challenge],
      })
      .mockResolvedValueOnce({
        discoveredJobs: [partialJob],
        sourceErrors: [],
        pendingChallenges: [detailChallenge, challenge],
      });

    const runPromise = pipeline.runPipeline({
      sources: ["hiringcafe", "gradcracker"],
    });
    await vi.waitFor(() => {
      expect(pipeline.getPendingChallenges()).toHaveLength(2);
    });
    pipeline.resolvePipelineChallenge("hiringcafe");
    pipeline.resolvePipelineChallenge("gradcracker");

    const result = await runPromise;
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("Gradcracker still returned"),
    });
    expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(steps.importJobsStep)).not.toHaveBeenCalled();
  });
});
