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

  it("automatically solves and retries without publishing any manual Solve prompt", async () => {
    vi.stubEnv("CAPSOLVER_API_KEY", "key");
    const pipeline = await import("./orchestrator");
    const solver = await import("../services/capsolver");
    const steps = await import("./steps");
    const { subscribeToProgress } = await import("./progress");
    const progress = vi.fn();
    const unsubscribe = subscribeToProgress(progress);
    vi.mocked(solver.solveWithCapsolver)
      .mockReset()
      .mockResolvedValue(undefined);
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
        pendingChallenges: [],
      });

    const result = await pipeline.runPipeline({ sources: ["gradcracker"] });
    unsubscribe();
    expect(result.success).toBe(true);
    expect(solver.solveWithCapsolver).toHaveBeenCalledWith(
      expect.objectContaining({
        extractorId: "gradcracker",
        url: challenge.url,
      }),
    );
    expect(steps.discoverJobsStep).toHaveBeenLastCalledWith(
      expect.objectContaining({
        retryChallengeUrls: { gradcracker: challenge.url },
        resumeStates: { gradcracker: challenge.resumeState },
      }),
    );
    expect(pipeline.getPendingChallenges()).toEqual([]);
    expect(
      progress.mock.calls.some(
        ([event]) =>
          event.step === "challenge_required" ||
          event.pendingChallenges?.length,
      ),
    ).toBe(false);
    expect(JSON.stringify(progress.mock.calls)).not.toContain(
      "CAPSOLVER_API_KEY",
    );
  });

  it("retains partial jobs and reports a solver failure without pausing", async () => {
    vi.stubEnv("CAPSOLVER_API_KEY", "key");
    const pipeline = await import("./orchestrator");
    const solver = await import("../services/capsolver");
    const steps = await import("./steps");
    const pipelineRepo = await import("../repositories/pipeline");
    const job = {
      source: "gradcracker",
      sourceJobId: "1",
      title: "Engineer",
      employer: "Acme",
      jobUrl: "https://www.gradcracker.com/job/1",
    };
    vi.mocked(solver.solveWithCapsolver)
      .mockReset()
      .mockRejectedValue(
        new solver.CapsolverError("CapSolver has insufficient balance."),
      );
    vi.mocked(steps.discoverJobsStep)
      .mockReset()
      .mockResolvedValueOnce({
        discoveredJobs: [job],
        sourceErrors: [],
        pendingChallenges: [challenge],
      });
    const result = await pipeline.runPipeline({ sources: ["gradcracker"] });
    expect(result.success).toBe(true);
    expect(steps.importJobsStep).toHaveBeenCalledWith({
      discoveredJobs: [job],
    });
    expect(steps.discoverJobsStep).toHaveBeenCalledOnce();
    expect(pipeline.getPendingChallenges()).toEqual([]);
    expect(
      JSON.stringify(vi.mocked(pipelineRepo.updatePipelineRun).mock.calls),
    ).toContain("insufficient balance");
  });

  it("caps paid solve attempts when a board keeps returning challenges", async () => {
    vi.stubEnv("CAPSOLVER_API_KEY", "key");
    const pipeline = await import("./orchestrator");
    const solver = await import("../services/capsolver");
    const steps = await import("./steps");
    vi.mocked(solver.solveWithCapsolver)
      .mockReset()
      .mockResolvedValue(undefined);
    vi.mocked(steps.discoverJobsStep)
      .mockReset()
      .mockResolvedValue({
        discoveredJobs: [],
        sourceErrors: [],
        pendingChallenges: [challenge],
      });
    const result = await pipeline.runPipeline({ sources: ["gradcracker"] });
    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining("retry limit reached"),
    });
    expect(solver.solveWithCapsolver).toHaveBeenCalledTimes(3);
    expect(steps.discoverJobsStep).toHaveBeenCalledTimes(4);
    expect(pipeline.getPendingChallenges()).toEqual([]);
  });

  it("isolates automatic solves, cookie paths and cancellation across private workspaces", async () => {
    vi.stubEnv("CAPSOLVER_API_KEY", "key");
    vi.stubEnv("JOBOPS_APP_MODE", "hosted");
    vi.stubEnv("JOBOPS_HOSTED_TENANT_ID", "tenant-a");
    const pipeline = await import("./orchestrator");
    const solver = await import("../services/capsolver");
    const steps = await import("./steps");
    const { runWithRequestContext } = await import("@infra/request-context");
    const inA = <T>(fn: () => T) =>
      runWithRequestContext({ tenantId: "tenant-a", userId: "user-a" }, fn);
    const inB = <T>(fn: () => T) =>
      runWithRequestContext({ tenantId: "tenant-a", userId: "user-b" }, fn);
    const solves: Array<{
      signal: AbortSignal;
      storageDir: string;
      finish: () => void;
    }> = [];
    vi.mocked(solver.solveWithCapsolver)
      .mockReset()
      .mockImplementation(
        async (args) =>
          new Promise<void>((resolve, reject) => {
            solves.push({ ...args, finish: resolve });
            args.signal.addEventListener(
              "abort",
              () => reject(new Error("cancelled")),
              { once: true },
            );
          }),
      );
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
        pendingChallenges: [challenge],
      })
      .mockResolvedValueOnce({
        discoveredJobs: [],
        sourceErrors: [],
        pendingChallenges: [],
      });
    const runA = inA(() => pipeline.runPipeline({ sources: ["gradcracker"] }));
    await vi.waitFor(() => expect(solves).toHaveLength(1));
    const runB = inB(() => pipeline.runPipeline({ sources: ["gradcracker"] }));
    await vi.waitFor(() => expect(solves).toHaveLength(2));
    expect(solves[0].storageDir).not.toBe(solves[1].storageDir);
    inA(() => pipeline.requestPipelineCancel());
    expect(solves[0].signal.aborted).toBe(true);
    expect(solves[1].signal.aborted).toBe(false);
    expect(await runA).toMatchObject({
      success: false,
      error: "Cancelled by user request",
    });
    solves[1].finish();
    expect(await runB).toMatchObject({ success: true });
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
