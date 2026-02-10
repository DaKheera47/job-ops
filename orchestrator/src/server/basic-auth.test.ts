import { mkdtemp, rm } from "node:fs/promises";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";

const originalEnv = { ...process.env };

function buildAuthHeader(user: string, pass: string): string {
  const token = Buffer.from(`${user}:${pass}`).toString("base64");
  return `Basic ${token}`;
}

async function startServer(): Promise<{ server: Server; baseUrl: string }> {
  const app = createApp();
  const server = app.listen(0);
  await new Promise<void>((resolve) =>
    server.once("listening", () => resolve()),
  );
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve server address");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe.sequential("Basic Auth read-only enforcement", () => {
  let server: Server | null = null;
  let baseUrl = "";
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-auth-test-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = null;
    }
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = "";
    }
    process.env = { ...originalEnv };
  });

  it("allows read-only GETs without auth when Basic Auth is enabled", async () => {
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";

    ({ server, baseUrl } = await startServer());

    const healthRes = await fetch(`${baseUrl}/health`);
    expect(healthRes.status).toBe(200);

    const pdfRes = await fetch(`${baseUrl}/pdfs/does-not-exist.pdf`);
    expect(pdfRes.status).toBe(404);
  });

  it("blocks POST/PATCH/DELETE without auth when Basic Auth is enabled", async () => {
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";

    ({ server, baseUrl } = await startServer());

    const postRes = await fetch(`${baseUrl}/api/jobs/123/skip`, {
      method: "POST",
    });
    expect(postRes.status).toBe(401);
    expect(postRes.headers.get("www-authenticate")).toBeNull();

    const patchRes = await fetch(`${baseUrl}/api/jobs/123`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ready" }),
    });
    expect(patchRes.status).toBe(401);

    const deleteRes = await fetch(`${baseUrl}/api/jobs/status/skipped`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(401);
  });

  it("allows writes with valid Basic Auth when enabled", async () => {
    process.env.BASIC_AUTH_USER = "user";
    process.env.BASIC_AUTH_PASSWORD = "pass";

    ({ server, baseUrl } = await startServer());

    const authHeader = buildAuthHeader("user", "pass");
    const res = await fetch(`${baseUrl}/api/jobs/123/skip`, {
      method: "POST",
      headers: { Authorization: authHeader },
    });

    expect(res.status).not.toBe(401);
  });

  it("does not require auth when Basic Auth is disabled", async () => {
    delete process.env.BASIC_AUTH_USER;
    delete process.env.BASIC_AUTH_PASSWORD;

    ({ server, baseUrl } = await startServer());

    const res = await fetch(`${baseUrl}/api/jobs/123/skip`, { method: "POST" });
    expect(res.status).not.toBe(401);
  });
});
