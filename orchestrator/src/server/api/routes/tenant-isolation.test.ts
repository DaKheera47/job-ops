import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function importManualJob(baseUrl: string, token: string, title: string) {
  const res = await fetch(`${baseUrl}/api/manual-jobs/import`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({
      job: {
        title,
        employer: "Acme",
        jobUrl: "https://example.com/shared-job",
        jobDescription: "Tenant isolation role",
      },
    }),
  });
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.ok).toBe(true);
  return body.data as { id: string; title: string };
}

describe.sequential("Tenant isolation", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: AUTH_ENV,
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("isolates jobs and PDFs between private workspaces", async () => {
    const { scoreJobSuitability } = await import("@server/services/scorer");
    vi.mocked(scoreJobSuitability).mockResolvedValue({
      score: 80,
      reason: "Good fit",
    });

    const adminToken = await login(baseUrl, "admin", "secret");

    const createAdamRes = await fetch(`${baseUrl}/api/workspaces/users`, {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        username: "adam",
        displayName: "Adam",
        password: "adam-secret",
      }),
    });
    expect(createAdamRes.status).toBe(201);

    const adamToken = await login(baseUrl, "adam", "adam-secret");
    const adminJob = await importManualJob(baseUrl, adminToken, "Admin Role");
    const adamJob = await importManualJob(baseUrl, adamToken, "Adam Role");

    const adminList = await fetch(`${baseUrl}/api/jobs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }).then((res) => res.json());
    expect(adminList.data.jobs.map((job: { id: string }) => job.id)).toEqual([
      adminJob.id,
    ]);

    const adamList = await fetch(`${baseUrl}/api/jobs`, {
      headers: { Authorization: `Bearer ${adamToken}` },
    }).then((res) => res.json());
    expect(adamList.data.jobs.map((job: { id: string }) => job.id)).toEqual([
      adamJob.id,
    ]);

    const crossTenantJob = await fetch(`${baseUrl}/api/jobs/${adminJob.id}`, {
      headers: { Authorization: `Bearer ${adamToken}` },
    });
    expect(crossTenantJob.status).toBe(404);

    const pdfBytes = Buffer.from("%PDF-1.4\n%EOF\n").toString("base64");
    const uploadPdfRes = await fetch(`${baseUrl}/api/jobs/${adminJob.id}/pdf`, {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        fileName: "resume.pdf",
        mediaType: "application/pdf",
        dataBase64: pdfBytes,
      }),
    });
    expect(uploadPdfRes.status).toBe(201);

    const adminPdf = await fetch(`${baseUrl}/api/jobs/${adminJob.id}/pdf`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminPdf.status).toBe(200);

    const adamPdf = await fetch(`${baseUrl}/api/jobs/${adminJob.id}/pdf`, {
      headers: { Authorization: `Bearer ${adamToken}` },
    });
    expect(adamPdf.status).toBe(404);
  });

  it("returns 409 when creating a duplicate workspace username", async () => {
    const adminToken = await login(baseUrl, "admin", "secret");

    const firstRes = await fetch(`${baseUrl}/api/workspaces/users`, {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        username: "adam",
        displayName: "Adam",
        password: "adam-secret",
      }),
    });
    expect(firstRes.status).toBe(201);

    const secondRes = await fetch(`${baseUrl}/api/workspaces/users`, {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        username: " Adam ",
        displayName: "Adam Clone",
        password: "adam-secret-2",
      }),
    });
    const body = await secondRes.json();

    expect(secondRes.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
    expect(body.error.message).toContain("Username already exists");
  });

  it("revokes existing sessions when an admin resets a user password", async () => {
    const adminToken = await login(baseUrl, "admin", "secret");

    const createRes = await fetch(`${baseUrl}/api/workspaces/users`, {
      method: "POST",
      headers: authHeaders(adminToken),
      body: JSON.stringify({
        username: "adam",
        displayName: "Adam",
        password: "adam-secret",
      }),
    });
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      data: { user: { id: string } };
    };

    const adamToken = await login(baseUrl, "adam", "adam-secret");

    const resetRes = await fetch(
      `${baseUrl}/api/workspaces/users/${created.data.user.id}/reset-password`,
      {
        method: "POST",
        headers: authHeaders(adminToken),
        body: JSON.stringify({ password: "adam-secret-2" }),
      },
    );
    expect(resetRes.status).toBe(200);

    const oldSessionRes = await fetch(`${baseUrl}/api/jobs`, {
      headers: { Authorization: `Bearer ${adamToken}` },
    });
    expect(oldSessionRes.status).toBe(401);

    const newToken = await login(baseUrl, "adam", "adam-secret-2");
    const newSessionRes = await fetch(`${baseUrl}/api/jobs`, {
      headers: { Authorization: `Bearer ${newToken}` },
    });
    expect(newSessionRes.status).toBe(200);
  });
});
