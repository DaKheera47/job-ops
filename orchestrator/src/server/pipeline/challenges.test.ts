import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const challenge = {
  extractorId: "gradcracker",
  extractorName: "Gradcracker",
  url: "https://www.gradcracker.com/search/computing-technology/software-developer-graduate-jobs-in-london-and-south-east?order=dateAdded",
  sources: ["gradcracker" as const],
  resumeState: { cursor: "page-2" },
};

vi.mock("../services/capsolver", () => ({
  CapsolverError: class extends Error {},
  solveWithCapsolver: vi.fn(async () => undefined),
}));

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
    vi.stubEnv("CAPSOLVER_API_KEY", "");
    vi.stubEnv("CAPSOLVER_PROXY", "");
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-pipeline-challenge-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";

    await import("../db/migrate");
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
  });

  it.each([
    "solved",
    "failed",
    "retry limit",
  ])("handles automatic checks without manual prompts: %s", async (outcome) => {
    vi.stubEnv("CAPSOLVER_API_KEY", "key");
    vi.stubEnv("JOBOPS_APP_MODE", "hosted");
    vi.stubEnv("JOBOPS_HOSTED_TENANT_ID", "tenant-a");
    const pipeline = await import("./orchestrator");
    const solver = await import("../services/capsolver");
    const steps = await import("./steps");
    const pipelineRepo = await import("../repositories/pipeline");
    const { subscribeToProgress } = await import("./progress");
    const { runWithRequestContext } = await import("@infra/request-context");
    const job = {
      source: "gradcracker",
      title: "Engineer",
      employer: "Acme",
      jobUrl: "https://www.gradcracker.com/job/1",
    };
    const discovered = {
      discoveredJobs: [job],
      sourceErrors: [],
      pendingChallenges: [challenge],
    };
    vi.mocked(solver.solveWithCapsolver)
      .mockReset()
      .mockResolvedValue(undefined);
    if (outcome === "failed")
      vi.mocked(solver.solveWithCapsolver).mockRejectedValue(
        new solver.CapsolverError("CapSolver has insufficient balance."),
      );

    for (const userId of ["user-a", "user-b"]) {
      vi.mocked(steps.discoverJobsStep)
        .mockReset()
        .mockResolvedValue(
          outcome === "retry limit"
            ? discovered
            : { ...discovered, pendingChallenges: [] },
        )
        .mockResolvedValueOnce(discovered);
      await runWithRequestContext(
        { tenantId: "tenant-a", userId },
        async () => {
          const progress = vi.fn();
          const unsubscribe = subscribeToProgress(progress);
          const result = await pipeline.runPipeline({
            sources: ["gradcracker"],
          });
          unsubscribe();
          expect(result.success).toBe(true);
          expect(pipeline.getPendingChallenges()).toEqual([]);
          expect(
            progress.mock.calls.some(
              ([event]) =>
                event.step === "challenge_required" ||
                event.pendingChallenges?.length,
            ),
          ).toBe(false);
          expect(steps.importJobsStep).toHaveBeenLastCalledWith({
            discoveredJobs: [job],
          });
        },
      );
    }
    const calls = vi.mocked(solver.solveWithCapsolver).mock.calls;
    const attempts = outcome === "retry limit" ? 3 : 1;
    expect(calls).toHaveLength(attempts * 2);
    expect(calls[0][0].storageDir).not.toBe(calls[attempts][0].storageDir);
    if (outcome !== "solved")
      expect(
        JSON.stringify(vi.mocked(pipelineRepo.updatePipelineRun).mock.calls),
      ).toContain(
        outcome === "failed" ? "insufficient balance" : "retry limit reached",
      );
  });

  it("asks again when a different search challenge appears after a solve", async () => {
    const pipeline = await import("./orchestrator");
    const pipelineRepo = await import("../repositories/pipeline");
    const steps = await import("./steps");
    const nextChallenge = {
      ...challenge,
      url: "https://www.gradcracker.com/search/another-query",
    };
    vi.mocked(steps.discoverJobsStep)
      .mockReset()
      .mockResolvedValueOnce({
        discoveredJobs: [],
        sourceErrors: [],
        pendingChallenges: [challenge],
      })
      .mockResolvedValueOnce({
        discoveredJobs: [],
        sourceErrors: [],
        pendingChallenges: [nextChallenge],
      })
      .mockResolvedValueOnce({
        discoveredJobs: [],
        sourceErrors: [],
        pendingChallenges: [],
      });

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

    await vi.waitFor(() => {
      expect(pipeline.getPendingChallenges()).toEqual([nextChallenge]);
    });
    expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        resumeStates: { gradcracker: { cursor: "page-2" } },
      }),
    );
    expect(vi.mocked(steps.importJobsStep)).not.toHaveBeenCalled();

    expect(pipeline.resolvePipelineChallenge("gradcracker")).toEqual({
      resolved: true,
      remaining: 0,
    });
    const result = await runPromise;

    expect(result).toMatchObject({ success: true, jobsDiscovered: 0 });
    expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(steps.importJobsStep)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(pipelineRepo.updatePipelineRun)).not.toHaveBeenCalledWith(
      "run-challenge-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("allows skipping one Hiring Cafe search only after a solve attempt and retains earlier jobs", async () => {
    const pipeline = await import("./orchestrator");
    const steps = await import("./steps");
    const { runWithRequestContext } = await import("@infra/request-context");
    const searchState = JSON.stringify({ searchQuery: "backend engineer" });
    const searchChallenge = {
      extractorId: "hiringcafe",
      extractorName: "Hiring Cafe",
      url: `https://hiringcafe.com/?searchState=${encodeURIComponent(searchState)}`,
      sources: ["hiringcafe" as const],
      resumeState: {
        locationIndex: 0,
        termIndex: 0,
        location: "Amsterdam",
        searchTerm: "backend engineer",
        pageNo: 2,
        termCollected: 40,
        searchState,
        seenKeys: ["earlier"],
      },
    };
    const earlierJob = {
      source: "hiringcafe",
      sourceJobId: "earlier",
      title: "Web Developer",
      employer: "Acme",
      jobUrl: "https://hiringcafe.com/job/earlier",
    };
    const laterJob = {
      ...earlierJob,
      sourceJobId: "later",
      title: "Data Engineer",
      jobUrl: "https://hiringcafe.com/job/later",
    };
    vi.mocked(steps.discoverJobsStep)
      .mockReset()
      .mockResolvedValueOnce({
        discoveredJobs: [earlierJob],
        sourceErrors: [],
        pendingChallenges: [searchChallenge],
      })
      .mockResolvedValueOnce({
        discoveredJobs: [laterJob],
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
      expect(inTenantA(() => pipeline.getPendingChallenges())).toEqual([
        { ...searchChallenge, canSkipSearch: true, solveAttempted: false },
      ]);
    });
    expect(
      inTenantA(() => pipeline.skipPipelineChallengeSearch("hiringcafe")),
    ).toEqual({
      status: "not_allowed",
    });
    expect(
      inTenantB(() => pipeline.skipPipelineChallengeSearch("hiringcafe")),
    ).toEqual({
      status: "not_found",
    });
    const finishSolve = inTenantA(() =>
      pipeline.beginPipelineChallengeSolve("hiringcafe"),
    );
    expect(finishSolve).toBeTypeOf("function");
    expect(
      inTenantA(() => pipeline.skipPipelineChallengeSearch("hiringcafe")),
    ).toEqual({
      status: "busy",
    });
    expect(inTenantA(() => pipeline.getPendingChallenges()[0])).toMatchObject({
      solveAttempted: true,
    });
    finishSolve?.();
    expect(
      inTenantA(() => pipeline.skipPipelineChallengeSearch("hiringcafe")),
    ).toEqual({
      status: "skipped",
      remaining: 0,
    });
    await runPromise;
    expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenLastCalledWith(
      expect.objectContaining({
        skippedChallengeSearchStates: [searchState],
        resumeStates: { hiringcafe: searchChallenge.resumeState },
      }),
    );
    expect(vi.mocked(steps.importJobsStep)).toHaveBeenCalledWith({
      discoveredJobs: [earlierJob, laterJob],
    });
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

  it("keeps both challenged sources paused and retains Hiring Cafe jobs", async () => {
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
      })
      .mockResolvedValueOnce({
        discoveredJobs: [partialJob],
        sourceErrors: [],
        pendingChallenges: [challenge],
      })
      .mockResolvedValueOnce({
        discoveredJobs: [],
        sourceErrors: [],
        pendingChallenges: [],
      });

    const runPromise = pipeline.runPipeline({
      sources: ["hiringcafe", "gradcracker"],
    });
    await vi.waitFor(() => {
      expect(pipeline.getPendingChallenges()).toHaveLength(2);
    });
    pipeline.resolvePipelineChallenge("hiringcafe");
    pipeline.resolvePipelineChallenge("gradcracker");

    await vi.waitFor(() => {
      expect(pipeline.getPendingChallenges()).toEqual([
        detailChallenge,
        challenge,
      ]);
    });
    expect(vi.mocked(steps.importJobsStep)).not.toHaveBeenCalled();
    pipeline.resolvePipelineChallenge("hiringcafe");
    pipeline.resolvePipelineChallenge("gradcracker");

    await vi.waitFor(() => {
      expect(pipeline.getPendingChallenges()).toEqual([challenge]);
    });
    expect(vi.mocked(steps.importJobsStep)).not.toHaveBeenCalled();
    pipeline.resolvePipelineChallenge("gradcracker");

    const result = await runPromise;
    expect(result).toMatchObject({ success: true });
    expect(vi.mocked(steps.discoverJobsStep)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(steps.importJobsStep)).toHaveBeenCalledWith({
      discoveredJobs: [partialJob],
    });
  });
});
