import type { Server } from "node:http";
import type { PipelineSearchPresetConfig } from "@shared/types";
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

  it("creates, applies, updates, lists, and deletes pipeline saved searches", async () => {
    const config: PipelineSearchPresetConfig = {
      searchTerms: ["backend engineer"],
      sources: ["linkedin"],
      country: "united kingdom",
      cityLocations: ["London"],
      workplaceTypes: ["remote", "hybrid"],
      searchScope: "selected_only",
      matchStrictness: "exact_only",
      topN: 10,
      minSuitabilityScore: 55,
      runBudget: 250,
      automaticPresetId: "custom",
    };

    const createRes = await fetch(`${baseUrl}/api/pipeline/search-presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "London backend", config }),
    });
    const createBody = await createRes.json();

    expect(createRes.status).toBe(201);
    expect(createBody.ok).toBe(true);
    expect(createBody.meta.requestId).toBeTruthy();
    expect(createBody.data).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: "London backend",
        config,
        lastUsedAt: null,
      }),
    );

    const duplicateRes = await fetch(`${baseUrl}/api/pipeline/search-presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "London backend", config }),
    });
    const duplicateBody = await duplicateRes.json();
    expect(duplicateRes.status).toBe(409);
    expect(duplicateBody.error.code).toBe("CONFLICT");

    const usedRes = await fetch(
      `${baseUrl}/api/pipeline/search-presets/${createBody.data.id}/used`,
      { method: "POST" },
    );
    const usedBody = await usedRes.json();
    expect(usedRes.status).toBe(200);
    expect(usedBody.data.lastUsedAt).toEqual(expect.any(String));

    const updateRes = await fetch(
      `${baseUrl}/api/pipeline/search-presets/${createBody.data.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Senior backend",
          config: { ...config, searchTerms: ["senior backend engineer"] },
        }),
      },
    );
    const updateBody = await updateRes.json();
    expect(updateRes.status).toBe(200);
    expect(updateBody.data.name).toBe("Senior backend");
    expect(updateBody.data.config.searchTerms).toEqual([
      "senior backend engineer",
    ]);

    const listRes = await fetch(`${baseUrl}/api/pipeline/search-presets`);
    const listBody = await listRes.json();
    expect(listRes.status).toBe(200);
    expect(listBody.ok).toBe(true);
    expect(listBody.data.searches).toHaveLength(1);
    expect(listBody.data.searches[0].name).toBe("Senior backend");

    const deleteRes = await fetch(
      `${baseUrl}/api/pipeline/search-presets/${createBody.data.id}`,
      { method: "DELETE" },
    );
    const deleteBody = await deleteRes.json();
    expect(deleteRes.status).toBe(200);
    expect(deleteBody.data).toEqual({ deleted: true });

    const missingDeleteRes = await fetch(
      `${baseUrl}/api/pipeline/search-presets/${createBody.data.id}`,
      { method: "DELETE" },
    );
    expect(missingDeleteRes.status).toBe(404);
  });

  it("scopes pipeline saved searches by tenant and user", async () => {
    const { db, schema } = await import("@server/db");
    const { runWithRequestContext } = await import(
      "@server/infra/request-context"
    );
    const repo = await import("@server/repositories/pipeline-search-presets");
    const config: PipelineSearchPresetConfig = {
      searchTerms: ["platform engineer"],
      sources: ["linkedin"],
      country: "united states",
      cityLocations: ["New York"],
      workplaceTypes: ["remote"],
      searchScope: "selected_only",
      matchStrictness: "exact_only",
      topN: 5,
      minSuitabilityScore: 65,
      runBudget: 150,
      automaticPresetId: "fast",
    };

    await db.insert(schema.tenants).values({
      id: "tenant-alt",
      name: "Alt",
      slug: "tenant-alt",
    });

    await runWithRequestContext(
      {
        requestId: "saved-search-user-a",
        tenantId: "tenant_default",
        userId: "user-a",
      },
      () =>
        repo.createPipelineSearchPreset({
          name: "Same name",
          config,
        }),
    );
    await runWithRequestContext(
      {
        requestId: "saved-search-user-b",
        tenantId: "tenant_default",
        userId: "user-b",
      },
      () =>
        repo.createPipelineSearchPreset({
          name: "Same name",
          config,
        }),
    );
    await runWithRequestContext(
      {
        requestId: "saved-search-tenant-alt",
        tenantId: "tenant-alt",
        userId: "user-a",
      },
      () =>
        repo.createPipelineSearchPreset({
          name: "Same name",
          config,
        }),
    );

    const userAResults = await runWithRequestContext(
      {
        requestId: "saved-search-list-a",
        tenantId: "tenant_default",
        userId: "user-a",
      },
      () => repo.listPipelineSearchPresets(),
    );
    const userBResults = await runWithRequestContext(
      {
        requestId: "saved-search-list-b",
        tenantId: "tenant_default",
        userId: "user-b",
      },
      () => repo.listPipelineSearchPresets(),
    );
    const tenantAltResults = await runWithRequestContext(
      {
        requestId: "saved-search-list-alt",
        tenantId: "tenant-alt",
        userId: "user-a",
      },
      () => repo.listPipelineSearchPresets(),
    );

    expect(userAResults).toHaveLength(1);
    expect(userBResults).toHaveLength(1);
    expect(tenantAltResults).toHaveLength(1);
    expect(
      new Set([userAResults[0].id, userBResults[0].id, tenantAltResults[0].id])
        .size,
    ).toBe(3);
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
          jobindexMaxJobsPerTerm: 50,
          naukriMaxJobsPerTerm: 50,
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
        selected_sources: "gradcracker",
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

    const naukriRunRes = await fetch(`${baseUrl}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources: ["naukri"],
        country: "india",
      }),
    });
    const naukriRunBody = await naukriRunRes.json();
    expect(naukriRunBody.ok).toBe(true);
    expect(runPipeline).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        sources: ["naukri"],
        locationIntent: expect.objectContaining({
          selectedCountry: "india",
          country: "india",
        }),
      }),
    );

    const blockedNaukriRes = await fetch(`${baseUrl}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sources: ["naukri"],
        country: "united kingdom",
      }),
    });
    const blockedNaukriBody = await blockedNaukriRes.json();
    expect(blockedNaukriRes.status).toBe(400);
    expect(blockedNaukriBody.ok).toBe(false);
    expect(blockedNaukriBody.error.message).toContain("incompatible");
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

  // -- Challenge endpoints --
  // Route-level tests only: validates wiring, request validation, and 404 on
  // unknown extractor. The actual solver (browser-utils/solver.ts) launches a
  // headed browser for human interaction — not feasible to unit test. Deferring
  // solver-level tests until a real regression justifies the complexity.

  it("returns empty challenges when no pipeline is paused", async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/challenges`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.challenges).toEqual([]);
  });

  it("prepares the challenge viewer lazily", async () => {
    const { ensureChallengeViewer } = await import(
      "@server/services/challenge-viewer"
    );
    vi.mocked(ensureChallengeViewer).mockResolvedValueOnce({
      available: true,
    });

    const res = await fetch(`${baseUrl}/api/pipeline/challenge-viewer`, {
      method: "POST",
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      available: true,
      viewerUrl: "/challenge-viewer/session/viewer-token/vnc.html",
      reason: null,
    });
    expect(ensureChallengeViewer).toHaveBeenCalledTimes(1);
  });

  it("rejects solve-challenge with invalid payload", async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/solve-challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when solving a challenge for unknown extractor", async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/solve-challenge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        extractorId: "nonexistent",
      }),
    });
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
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
