import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Jobs tailoring PATCH route", () => {
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

  async function createManualJobId(): Promise<string> {
    const response = await fetch(`${baseUrl}/api/manual-jobs/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job: {
          title: "Backend Engineer",
          employer: "Acme",
          jobDescription: "Build backend systems",
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data?: { id: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data?.id).toBeTruthy();
    const jobId = body.data?.id;
    if (!jobId) {
      throw new Error("Expected manual job import to return job id");
    }
    return jobId;
  }

  it("accepts tailoredHeadline and tailoredSkills when JSON shape is valid", async () => {
    const jobId = await createManualJobId();
    const skills = JSON.stringify([
      { name: "Backend", keywords: ["TypeScript", "Node.js"] },
    ]);

    const response = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tailoredHeadline: "Senior Backend Engineer",
        tailoredSkills: skills,
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      ok: boolean;
      data?: { tailoredHeadline: string; tailoredSkills: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data?.tailoredHeadline).toBe("Senior Backend Engineer");
    expect(body.data?.tailoredSkills).toBe(skills);
  });

  it("rejects malformed tailoredSkills payload with 400", async () => {
    const jobId = await createManualJobId();

    const response = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tailoredHeadline: "Senior Backend Engineer",
        tailoredSkills: '{"name":"Backend","keywords":["TypeScript"]}',
      }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      ok?: boolean;
      error?: { message?: string } | string;
    };
    if (typeof body.error === "string") {
      expect(body.error).toContain("JSON array");
      return;
    }

    expect(body.ok).toBe(false);
    expect(body.error?.message || "").toContain("JSON array");
  });
});
