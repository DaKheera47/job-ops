import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

const AUTH_ENV = {
  BASIC_AUTH_USER: "admin",
  BASIC_AUTH_PASSWORD: "secret",
  JWT_SECRET: "an-explicit-jwt-secret-with-at-least-32-chars",
  JOBOPS_TEST_AUTH_BYPASS: "0",
};

async function login(baseUrl: string, username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  expect(res.status).toBe(200);
  return body.data.token as string;
}

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
    const { createJob } = await import("@server/repositories/jobs");
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
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("rejects database clearing for non-admin users", async () => {
    await stopServer({ server, closeDb, tempDir });
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: AUTH_ENV,
    }));

    const adminToken = await login(baseUrl, "admin", "secret");
    const createUserRes = await fetch(`${baseUrl}/api/workspaces/users`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: "regular",
        password: "regular-secret",
      }),
    });
    expect(createUserRes.status).toBe(201);

    const regularToken = await login(baseUrl, "regular", "regular-secret");
    const res = await fetch(`${baseUrl}/api/database`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${regularToken}` },
    });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
