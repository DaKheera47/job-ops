import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Database API routes", () => {
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

  it("clears jobs and pipeline runs", async () => {
    const { createJob } = await import("../../repositories/jobs");
    await createJob({
      source: "manual",
      title: "Cleanup Role",
      employer: "Acme",
      jobUrl: "https://example.com/job/cleanup",
      jobDescription: "Test description",
    });

    const res = await fetch(`${baseUrl}/api/database`, { method: "DELETE" });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.jobsDeleted).toBe(1);
  });
});
