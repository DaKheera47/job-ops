import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Pipeline API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("reports pipeline status", async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/status`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.isRunning).toBe(false);
    expect(body.data.lastRun).toBeNull();
  });

  it("returns the current pipeline progress snapshot in the API envelope", async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/progress/snapshot`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.meta.requestId).toBeTruthy();
    expect(body.data).toEqual(
      expect.objectContaining({
        step: "idle",
        message: "Ready",
      }),
    );
  });

  it("requires auth for the pipeline progress snapshot when auth is enabled", async () => {
    await stopServer({ server, closeDb, tempDir });
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        BASIC_AUTH_USER: "admin",
        BASIC_AUTH_PASSWORD: "secret",
        JOBOPS_TEST_AUTH_BYPASS: "0",
        JWT_SECRET: "an-explicit-jwt-secret-with-at-least-32-chars",
      },
    }));

    const unauthorizedRes = await fetch(
      `${baseUrl}/api/pipeline/progress/snapshot`,
    );
    expect(unauthorizedRes.status).toBe(401);

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password: "secret" }),
    });
    const loginBody = await loginRes.json();

    const authorizedRes = await fetch(
      `${baseUrl}/api/pipeline/progress/snapshot`,
      {
        headers: { Authorization: `Bearer ${loginBody.data.token}` },
      },
    );
    const authorizedBody = await authorizedRes.json();

    expect(authorizedRes.status).toBe(200);
    expect(authorizedBody.ok).toBe(true);
    expect(authorizedBody.meta.requestId).toBeTruthy();
  });

  it("returns recent pipeline runs in the API envelope", async () => {
    const { db, schema } = await import("@server/db");

    await db.insert(schema.pipelineRuns).values({
      id: "run-history-1",
      startedAt: "2026-04-18T10:00:00.000Z",
      completedAt: "2026-04-18T10:05:00.000Z",
      status: "completed",
      jobsDiscovered: 12,
      jobsProcessed: 3,
      errorMessage: null,
    });

    const res = await fetch(`${baseUrl}/api/pipeline/runs`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.meta.requestId).toBeTruthy();
    expect(body.data).toEqual([
      expect.objectContaining({
        id: "run-history-1",
        status: "completed",
        jobsDiscovered: 12,
        jobsProcessed: 3,
      }),
    ]);
  });

  it("returns pipeline run insights for a completed run", async () => {
    const { db, schema } = await import("@server/db");

    await db.insert(schema.pipelineRuns).values({
      id: "run-insight-1",
      startedAt: "2026-04-18T10:00:00.000Z",
      completedAt: "2026-04-18T10:10:00.000Z",
      status: "completed",
      jobsDiscovered: 8,
      jobsProcessed: 1,
      errorMessage: null,
      requestedConfig: {
        topN: 10,
        minSuitabilityScore: 55,
        sources: ["linkedin", "indeed"],
        enableCrawling: true,
        enableScoring: true,
        enableImporting: true,
        enableAutoTailoring: true,
      },
      effectiveConfig: {
        country: "united states",
        countryLabel: "United States",
        searchCities: ["London"],
        searchTermsCount: 2,
        workplaceTypes: ["remote"],
        locationSearchScope: "selected_only",
        locationMatchStrictness: "exact_only",
        compatibleSources: ["linkedin", "indeed"],
        skippedSources: [],
        blockedCompanyKeywordsCount: 1,
        sourceLimits: {
          ukvisajobsMaxJobs: 50,
          adzunaMaxJobsPerTerm: 50,
          gradcrackerMaxJobsPerTerm: 50,
          startupjobsMaxJobsPerTerm: 50,
          jobspyResultsWanted: 20,
        },
        autoSkipScoreThreshold: 65,
        pdfRenderer: "rxresume",
        models: {
          scorer: "model-scorer",
          tailoring: "model-tailoring",
          projectSelection: "model-project-selection",
        },
        resumeProjects: {
          maxProjects: 3,
          lockedProjectCount: 1,
          aiSelectableProjectCount: 2,
        },
      },
      resultSummary: {
        stage: "processing",
        jobsScored: 5,
        jobsSelected: 2,
        sourceErrors: ["indeed: upstream timeout"],
      },
    });

    await db.insert(schema.jobs).values([
      {
        id: "job-in-window-1",
        source: "manual",
        title: "Backend Engineer",
        employer: "Acme",
        jobUrl: "https://example.com/jobs/1",
        discoveredAt: "2026-04-18T10:01:00.000Z",
        createdAt: "2026-04-18T10:01:00.000Z",
        updatedAt: "2026-04-18T10:03:00.000Z",
        processedAt: "2026-04-18T10:06:00.000Z",
      },
      {
        id: "job-in-window-2",
        source: "manual",
        title: "Platform Engineer",
        employer: "Acme",
        jobUrl: "https://example.com/jobs/2",
        discoveredAt: "2026-04-18T10:02:00.000Z",
        createdAt: "2026-04-18T10:02:00.000Z",
        updatedAt: "2026-04-18T10:08:00.000Z",
      },
      {
        id: "job-outside-window",
        source: "manual",
        title: "Site Reliability Engineer",
        employer: "Acme",
        jobUrl: "https://example.com/jobs/3",
        discoveredAt: "2026-04-18T09:40:00.000Z",
        createdAt: "2026-04-18T09:40:00.000Z",
        updatedAt: "2026-04-18T09:50:00.000Z",
        processedAt: "2026-04-18T09:55:00.000Z",
      },
    ]);

    const res = await fetch(
      `${baseUrl}/api/pipeline/runs/run-insight-1/insights`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.meta.requestId).toBeTruthy();
    expect(body.data.run).toEqual(
      expect.objectContaining({
        id: "run-insight-1",
        status: "completed",
      }),
    );
    expect(body.data.exactMetrics.durationMs).toBe(600000);
    expect(body.data.savedDetails).toEqual(
      expect.objectContaining({
        requestedConfig: expect.objectContaining({
          topN: 10,
          sources: ["linkedin", "indeed"],
        }),
        resultSummary: expect.objectContaining({
          stage: "processing",
          sourceErrors: ["indeed: upstream timeout"],
        }),
      }),
    );
    expect(body.data.inferredMetrics.jobsCreated).toEqual({
      value: 2,
      quality: "inferred_from_timestamps",
    });
    expect(body.data.inferredMetrics.jobsUpdated).toEqual({
      value: 2,
      quality: "inferred_from_timestamps",
    });
    expect(body.data.inferredMetrics.jobsProcessed).toEqual({
      value: 1,
      quality: "inferred_from_timestamps",
    });
  });

  it("returns unavailable inferred metrics for incomplete runs", async () => {
    const { db, schema } = await import("@server/db");

    await db.insert(schema.pipelineRuns).values({
      id: "run-incomplete-1",
      startedAt: "2026-04-18T11:00:00.000Z",
      completedAt: null,
      status: "running",
      jobsDiscovered: 4,
      jobsProcessed: 0,
      errorMessage: null,
    });

    const res = await fetch(
      `${baseUrl}/api/pipeline/runs/run-incomplete-1/insights`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.savedDetails).toBeNull();
    expect(body.data.inferredMetrics.jobsCreated).toEqual({
      value: null,
      quality: "unavailable",
    });
    expect(body.data.inferredMetrics.jobsUpdated).toEqual({
      value: null,
      quality: "unavailable",
    });
    expect(body.data.inferredMetrics.jobsProcessed).toEqual({
      value: null,
      quality: "unavailable",
    });
  });

  it("returns not found for an unknown run insights request", async () => {
    const res = await fetch(
      `${baseUrl}/api/pipeline/runs/does-not-exist/insights`,
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.meta.requestId).toBeTruthy();
  });

  it("validates pipeline run payloads", async () => {
    const { trackCanonicalActivationEvent } = await import(
      "@server/services/activation-funnel"
    );
    const badRun = await fetch(`${baseUrl}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minSuitabilityScore: 120 }),
    });
    expect(badRun.status).toBe(400);

    const { runPipeline } = await import("@server/pipeline/index");
    const runRes = await fetch(`${baseUrl}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topN: 5,
        minSuitabilityScore: 65,
        runBudget: 150,
        searchTerms: ["backend engineer"],
        country: "united kingdom",
        cityLocations: ["London"],
        workplaceTypes: ["remote", "hybrid"],
        searchScope: "selected_plus_remote_worldwide",
        matchStrictness: "flexible",
        sources: ["gradcracker"],
      }),
    });
    const runBody = await runRes.json();
    expect(runBody.ok).toBe(true);
    expect(runPipeline).toHaveBeenCalledWith(
      expect.objectContaining({
        topN: 5,
        minSuitabilityScore: 65,
        sources: ["gradcracker"],
        locationIntent: expect.objectContaining({
          selectedCountry: "united kingdom",
          country: "united kingdom",
          cityLocations: ["London"],
          workplaceTypes: ["remote", "hybrid"],
          geoScope: "selected_plus_remote_worldwide",
          searchScope: "selected_plus_remote_worldwide",
          matchStrictness: "flexible",
        }),
      }),
    );
    expect(trackCanonicalActivationEvent).toHaveBeenCalledWith(
      "jobs_pipeline_run_started",
      expect.objectContaining({
        source_count: 1,
        top_n: 5,
        min_suitability_score: 65,
        country: "united kingdom",
        has_city_locations: true,
        search_terms_count: 1,
      }),
      expect.objectContaining({
        urlPath: "/jobs",
      }),
    );

    const glassdoorRunRes = await fetch(`${baseUrl}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources: ["glassdoor"] }),
    });
    const glassdoorRunBody = await glassdoorRunRes.json();
    expect(glassdoorRunRes.status).toBe(400);
    expect(glassdoorRunBody.ok).toBe(false);
    expect(glassdoorRunBody.error.message).toContain("incompatible");

    const adzunaRunRes = await fetch(`${baseUrl}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources: ["adzuna"],
        country: "united kingdom",
      }),
    });
    const adzunaRunBody = await adzunaRunRes.json();
    expect(adzunaRunBody.ok).toBe(true);
    expect(runPipeline).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sources: ["adzuna"],
        locationIntent: expect.objectContaining({
          selectedCountry: "united kingdom",
          country: "united kingdom",
          cityLocations: [],
          workplaceTypes: [],
          geoScope: "selected_only",
          searchScope: "selected_only",
          matchStrictness: "exact_only",
        }),
      }),
    );
  });

  it("returns conflict when cancelling with no active pipeline", async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/cancel`, {
      method: "POST",
    });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("accepts cancellation when pipeline is running", async () => {
    const { requestPipelineCancel } = await import("@server/pipeline/index");
    vi.mocked(requestPipelineCancel).mockReturnValue({
      accepted: true,
      pipelineRunId: "run-1",
      alreadyRequested: false,
    });

    const res = await fetch(`${baseUrl}/api/pipeline/cancel`, {
      method: "POST",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.pipelineRunId).toBe("run-1");
    expect(body.data.alreadyRequested).toBe(false);
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("streams pipeline progress over SSE", async () => {
    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/api/pipeline/progress`, {
      signal: controller.signal,
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body?.getReader();
    if (reader) {
      try {
        const { value } = await reader.read();
        const text = new TextDecoder().decode(value);
        expect(text).toContain("data:");
        expect(text).toContain('"crawlingSource"');
        expect(text).toContain('"crawlingSourcesTotal"');
      } finally {
        await reader.cancel();
        controller.abort();
      }
    } else {
      controller.abort();
    }
  });
});
