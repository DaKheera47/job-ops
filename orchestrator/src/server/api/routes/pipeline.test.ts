import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Pipeline API routes", () => {
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

  it("reports pipeline status", async () => {
    const res = await fetch(`${baseUrl}/api/pipeline/status`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.isRunning).toBe(false);
    expect(body.data.lastRun).toBeNull();
  });

  it("validates pipeline run payloads", async () => {
    const badRun = await fetch(`${baseUrl}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minSuitabilityScore: 120 }),
    });
    expect(badRun.status).toBe(400);

    const { runPipeline } = await import("../../pipeline/index");
    const runRes = await fetch(`${baseUrl}/api/pipeline/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topN: 5, sources: ["gradcracker"] }),
    });
    const runBody = await runRes.json();
    expect(runBody.ok).toBe(true);
    expect(runPipeline).toHaveBeenCalledWith({
      topN: 5,
      sources: ["gradcracker"],
    });
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
      } finally {
        await reader.cancel();
        controller.abort();
      }
    } else {
      controller.abort();
    }
  });
});
