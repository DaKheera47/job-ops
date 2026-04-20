import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Manual jobs API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;
  let nativeFetch: typeof globalThis.fetch;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
    nativeFetch = globalThis.fetch;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await stopServer({ server, closeDb, tempDir });
  });

  describe("POST /api/manual-jobs/fetch", () => {
    it("rejects invalid URLs", async () => {
      const res = await fetch(`${baseUrl}/api/manual-jobs/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "not-a-valid-url" }),
      });

      expect(res.status).toBe(400);
    });

    it("rejects empty payload", async () => {
      const res = await fetch(`${baseUrl}/api/manual-jobs/fetch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      expect(res.status).toBe(400);
    });
  });

  it("infers manual jobs and rejects empty payloads", async () => {
    const badRes = await fetch(`${baseUrl}/api/manual-jobs/infer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(badRes.status).toBe(400);

    const { inferManualJobDetails } = await import(
      "@server/services/manualJob"
    );
    vi.mocked(inferManualJobDetails).mockResolvedValue({
      job: { title: "Backend Engineer", employer: "Acme" },
      warning: null,
    });

    const res = await fetch(`${baseUrl}/api/manual-jobs/infer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobDescription: "Role description" }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.job.title).toBe("Backend Engineer");
  });

  it("imports manual jobs and generates a fallback URL", async () => {
    const { processJob } = await import("@server/pipeline/index");
    const { scoreJobSuitability } = await import("@server/services/scorer");
    vi.mocked(scoreJobSuitability).mockResolvedValue({
      score: 88,
      reason: "Strong fit",
    });

    const res = await fetch(`${baseUrl}/api/manual-jobs/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job: {
          title: "Backend Engineer",
          employer: "Acme",
          jobDescription: "Great role",
        },
      }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.source).toBe("manual");
    expect(body.data.jobUrl).toMatch(/^manual:\/\//);
    expect(vi.mocked(processJob)).toHaveBeenCalledWith(body.data.id, {
      analyticsOrigin: "manual_job_create",
    });
    await new Promise((resolve) => setTimeout(resolve, 25));
  });

  describe("POST /api/manual-jobs/ingest", () => {
    function stubExternalFetch(
      implementation: (url: string) => Promise<Response>,
    ): void {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          if (url.startsWith(baseUrl)) {
            return nativeFetch(input as RequestInfo | URL, init);
          }
          return implementation(url);
        }),
      );
    }

    it("returns request timeout when upstream fetch aborts", async () => {
      stubExternalFetch(async () => {
        const error = new Error("Timed out");
        error.name = "AbortError";
        throw error;
      });

      const res = await fetch(`${baseUrl}/api/manual-jobs/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://jobs.example.com/role" }),
      });

      expect(res.status).toBe(408);
    });

    it("returns upstream error when the remote URL cannot be fetched", async () => {
      stubExternalFetch(async () => new Response("nope", { status: 503 }));

      const res = await fetch(`${baseUrl}/api/manual-jobs/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://jobs.example.com/role" }),
      });
      const body = await res.json();

      expect(res.status).toBe(502);
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("UPSTREAM_ERROR");
    });

    it("creates a ready job on the happy path and passes through request id", async () => {
      const { inferManualJobDetails } = await import(
        "@server/services/manualJob"
      );
      const { processJob } = await import("@server/pipeline/index");
      const { scoreJobSuitability } = await import("@server/services/scorer");
      vi.mocked(inferManualJobDetails).mockResolvedValue({
        job: {
          title: "Backend Engineer",
          employer: "Acme",
          jobDescription: "Build APIs",
        },
        warning: null,
      });
      vi.mocked(scoreJobSuitability).mockResolvedValue({
        score: 91,
        reason: "Strong fit",
      });
      stubExternalFetch(
        async () =>
          new Response(
            `
            <html>
              <head>
                <title>Backend Engineer</title>
                <meta property="og:title" content="Backend Engineer" />
                <meta property="og:site-name" content="Acme" />
              </head>
              <body>
                <main>Build APIs and services.</main>
              </body>
            </html>
            `,
            { status: 200 },
          ),
      );

      const res = await fetch(`${baseUrl}/api/manual-jobs/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req-manual-ingest-success",
        },
        body: JSON.stringify({ url: "https://jobs.example.com/role" }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(res.headers.get("x-request-id")).toBe("req-manual-ingest-success");
      expect(body.meta.requestId).toBe("req-manual-ingest-success");
      expect(body.data.ingestion).toEqual({
        source: "url",
        movedToReady: true,
        warning: null,
      });
      expect(body.data.job.jobUrl).toBe("https://jobs.example.com/role");
      expect(vi.mocked(processJob)).toHaveBeenCalledWith(body.data.job.id, {
        analyticsOrigin: "manual_job_create",
      });
      await new Promise((resolve) => setTimeout(resolve, 25));
    });

    it("persists the submitted URL when inference omits jobUrl", async () => {
      const { inferManualJobDetails } = await import(
        "@server/services/manualJob"
      );
      vi.mocked(inferManualJobDetails).mockResolvedValue({
        job: {
          title: "Platform Engineer",
          employer: "Example Corp",
          jobDescription: "Role details",
        },
        warning: null,
      });
      stubExternalFetch(
        async () =>
          new Response("<html><body><main>Role details</main></body></html>", {
            status: 200,
          }),
      );

      const res = await fetch(`${baseUrl}/api/manual-jobs/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://jobs.example.com/platform" }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.job.jobUrl).toBe("https://jobs.example.com/platform");
    });

    it("uses metadata fallbacks when inference omits title and employer", async () => {
      const { inferManualJobDetails } = await import(
        "@server/services/manualJob"
      );
      vi.mocked(inferManualJobDetails).mockResolvedValue({
        job: {
          jobDescription: "Design distributed systems",
        },
        warning: null,
      });
      stubExternalFetch(
        async () =>
          new Response(
            `
            <html>
              <head>
                <title>Ignored Title</title>
                <meta property="og:title" content="Principal Engineer" />
                <meta property="og:site-name" content="Site Employer" />
              </head>
              <body><main>Design distributed systems</main></body>
            </html>
            `,
            { status: 200 },
          ),
      );

      const res = await fetch(`${baseUrl}/api/manual-jobs/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://jobs.example.com/principal" }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.job.title).toBe("Principal Engineer");
      expect(body.data.job.employer).toBe("Site Employer");
    });

    it("creates a recoverable job when move-to-ready processing fails", async () => {
      const { inferManualJobDetails } = await import(
        "@server/services/manualJob"
      );
      const { processJob } = await import("@server/pipeline/index");
      const jobsRepo = await import("@server/repositories/jobs");
      vi.mocked(inferManualJobDetails).mockResolvedValue({
        job: {
          title: "Backend Engineer",
          employer: "Acme",
          jobDescription: "Build APIs",
        },
        warning: null,
      });
      vi.mocked(processJob).mockResolvedValueOnce({
        success: false,
        error: "LLM unavailable",
      });
      stubExternalFetch(
        async () =>
          new Response("<html><body><main>Build APIs</main></body></html>", {
            status: 200,
          }),
      );

      const res = await fetch(`${baseUrl}/api/manual-jobs/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: "https://jobs.example.com/recoverable" }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.ingestion.movedToReady).toBe(false);
      expect(body.data.ingestion.warning).toContain("LLM unavailable");

      const savedJob = await jobsRepo.getJobById(body.data.job.id);
      expect(savedJob?.status).not.toBe("ready");
      expect(savedJob?.source).toBe("manual");
    });

    it("returns unprocessable entity when fetched content cannot create a job", async () => {
      const { inferManualJobDetails } = await import(
        "@server/services/manualJob"
      );
      vi.mocked(inferManualJobDetails).mockResolvedValue({
        job: {},
        warning: "No signal",
      });
      stubExternalFetch(
        async () =>
          new Response(
            "<html><body><main>Not enough data</main></body></html>",
            {
              status: 200,
            },
          ),
      );

      const res = await fetch(`${baseUrl}/api/manual-jobs/ingest`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req-manual-ingest-fail",
        },
        body: JSON.stringify({ url: "https://jobs.example.com/unknown" }),
      });
      const body = await res.json();

      expect(res.status).toBe(422);
      expect(res.headers.get("x-request-id")).toBe("req-manual-ingest-fail");
      expect(body.meta.requestId).toBe("req-manual-ingest-fail");
      expect(body.error.code).toBe("UNPROCESSABLE_ENTITY");
    });
  });
});
