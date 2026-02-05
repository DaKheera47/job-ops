import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Manual jobs API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
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

    const { inferManualJobDetails } = await import("../../services/manualJob");
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
    const { scoreJobSuitability } = await import("../../services/scorer");
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
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
});
