import type { Server } from "node:http";
import { and, eq } from "drizzle-orm";
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

async function signup(baseUrl: string, username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  expect(res.status).toBe(201);
  return body.data.token as string;
}

async function getCurrentUser(baseUrl: string, token: string) {
  const res = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.ok).toBe(true);
  return body.data.user as {
    id: string;
    username: string;
    workspaceId: string;
    workspaceRole: "owner" | "member";
  };
}

async function promoteUserToTenantOwner(input: {
  userId: string;
  tenantId: string;
}) {
  const { db, schema } = await import("@server/db");
  await db
    .update(schema.tenantMemberships)
    .set({ role: "owner", updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(schema.tenantMemberships.userId, input.userId),
        eq(schema.tenantMemberships.tenantId, input.tenantId),
      ),
    );
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

describe.sequential("Hosted current-user isolation", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        JOBOPS_TEST_AUTH_BYPASS: "0",
        JOBOPS_APP_MODE: "hosted",
        JOBOPS_HOSTED_SIGNUPS_ENABLED: "true",
        JOBOPS_HOSTED_TENANT_ID: "tenant_default",
      },
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("isolates private data between two hosted users in the same tenant", async () => {
    const aliceToken = await signup(baseUrl, "alice", "alice-secret");
    const bobToken = await signup(baseUrl, "bob", "bob-secret");

    const aliceJob = await importManualJob(baseUrl, aliceToken, "Alice Role");
    const bobJob = await importManualJob(baseUrl, bobToken, "Bob Role");
    expect(aliceJob.id).not.toBe(bobJob.id);

    const aliceList = await fetch(`${baseUrl}/api/jobs`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    }).then((res) => res.json());
    expect(aliceList.data.jobs.map((job: { id: string }) => job.id)).toEqual([
      aliceJob.id,
    ]);

    const bobList = await fetch(`${baseUrl}/api/jobs`, {
      headers: { Authorization: `Bearer ${bobToken}` },
    }).then((res) => res.json());
    expect(bobList.data.jobs.map((job: { id: string }) => job.id)).toEqual([
      bobJob.id,
    ]);

    const bobReadsAliceJob = await fetch(`${baseUrl}/api/jobs/${aliceJob.id}`, {
      headers: { Authorization: `Bearer ${bobToken}` },
    });
    expect(bobReadsAliceJob.status).toBe(404);

    const bobMutatesAliceJob = await fetch(
      `${baseUrl}/api/jobs/${aliceJob.id}`,
      {
        method: "PATCH",
        headers: authHeaders(bobToken),
        body: JSON.stringify({ status: "ready" }),
      },
    );
    expect(bobMutatesAliceJob.status).toBe(404);

    const pdfBytes = Buffer.from("%PDF-1.4\n%EOF\n").toString("base64");
    const uploadPdfRes = await fetch(`${baseUrl}/api/jobs/${aliceJob.id}/pdf`, {
      method: "POST",
      headers: authHeaders(aliceToken),
      body: JSON.stringify({
        fileName: "resume.pdf",
        mediaType: "application/pdf",
        dataBase64: pdfBytes,
      }),
    });
    expect(uploadPdfRes.status).toBe(201);

    const bobReadsAlicePdf = await fetch(
      `${baseUrl}/api/jobs/${aliceJob.id}/pdf`,
      { headers: { Authorization: `Bearer ${bobToken}` } },
    );
    expect(bobReadsAlicePdf.status).toBe(404);

    const uploadDocumentRes = await fetch(
      `${baseUrl}/api/jobs/${aliceJob.id}/documents`,
      {
        method: "POST",
        headers: authHeaders(aliceToken),
        body: JSON.stringify({
          fileName: "note.txt",
          mediaType: "text/plain",
          dataBase64: Buffer.from("private note").toString("base64"),
        }),
      },
    );
    expect(uploadDocumentRes.status).toBe(201);

    const bobListsAliceDocuments = await fetch(
      `${baseUrl}/api/jobs/${aliceJob.id}/documents`,
      { headers: { Authorization: `Bearer ${bobToken}` } },
    );
    expect(bobListsAliceDocuments.status).toBe(404);

    const bobReadsAliceChat = await fetch(
      `${baseUrl}/api/jobs/${aliceJob.id}/chat/messages`,
      { headers: { Authorization: `Bearer ${bobToken}` } },
    );
    expect(bobReadsAliceChat.status).toBe(404);

    const savedSearchConfig = {
      searchTerms: ["backend engineer"],
      sources: ["linkedin"],
      country: "united kingdom",
      cityLocations: ["London"],
      workplaceTypes: ["remote"],
      searchScope: "selected_only",
      matchStrictness: "exact_only",
      topN: 10,
      minSuitabilityScore: 55,
      runBudget: 250,
      automaticPresetId: "custom",
    };

    for (const token of [aliceToken, bobToken]) {
      const res = await fetch(`${baseUrl}/api/pipeline/search-presets`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          name: "Same name",
          config: savedSearchConfig,
        }),
      });
      expect(res.status).toBe(201);
    }

    const aliceSearches = await fetch(
      `${baseUrl}/api/pipeline/search-presets`,
      { headers: { Authorization: `Bearer ${aliceToken}` } },
    ).then((res) => res.json());
    const bobSearches = await fetch(`${baseUrl}/api/pipeline/search-presets`, {
      headers: { Authorization: `Bearer ${bobToken}` },
    }).then((res) => res.json());

    expect(aliceSearches.data.searches).toHaveLength(1);
    expect(bobSearches.data.searches).toHaveLength(1);
    expect(aliceSearches.data.searches[0].id).not.toBe(
      bobSearches.data.searches[0].id,
    );
  });

  it("lets hosted tenant owners manage members in the configured tenant", async () => {
    const ownerToken = await signup(baseUrl, "owner", "owner-secret");
    const owner = await getCurrentUser(baseUrl, ownerToken);
    await promoteUserToTenantOwner({
      userId: owner.id,
      tenantId: owner.workspaceId,
    });

    const listBeforeRes = await fetch(`${baseUrl}/api/workspaces/users`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(listBeforeRes.status).toBe(200);
    const listBefore = await listBeforeRes.json();
    expect(listBefore.data.users).toEqual([
      expect.objectContaining({
        id: owner.id,
        username: "owner",
        workspaceId: "tenant_default",
        workspaceRole: "owner",
      }),
    ]);

    const createMemberRes = await fetch(`${baseUrl}/api/workspaces/users`, {
      method: "POST",
      headers: authHeaders(ownerToken),
      body: JSON.stringify({
        username: "member",
        displayName: "Member User",
        password: "member-secret",
        isSystemAdmin: true,
      }),
    });
    expect(createMemberRes.status).toBe(201);
    const createMemberBody = await createMemberRes.json();
    expect(createMemberBody.data.user).toMatchObject({
      username: "member",
      displayName: "Member User",
      isSystemAdmin: false,
      workspaceId: "tenant_default",
      workspaceRole: "member",
    });
    const memberId = createMemberBody.data.user.id as string;

    const memberToken = await login(baseUrl, "member", "member-secret");
    const resetRes = await fetch(
      `${baseUrl}/api/workspaces/users/${memberId}/reset-password`,
      {
        method: "POST",
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ password: "member-secret-2" }),
      },
    );
    expect(resetRes.status).toBe(200);

    const oldSessionRes = await fetch(`${baseUrl}/api/jobs`, {
      headers: { Authorization: `Bearer ${memberToken}` },
    });
    expect(oldSessionRes.status).toBe(401);

    const updatedMemberToken = await login(
      baseUrl,
      "member",
      "member-secret-2",
    );
    const disableRes = await fetch(
      `${baseUrl}/api/workspaces/users/${memberId}/disabled`,
      {
        method: "PATCH",
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ isDisabled: true }),
      },
    );
    expect(disableRes.status).toBe(200);
    const disabledLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "member",
        password: "member-secret-2",
      }),
    });
    expect(disabledLoginRes.status).toBe(401);

    const enableRes = await fetch(
      `${baseUrl}/api/workspaces/users/${memberId}/disabled`,
      {
        method: "PATCH",
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ isDisabled: false }),
      },
    );
    expect(enableRes.status).toBe(200);
    await login(baseUrl, "member", "member-secret-2");

    const memberListRes = await fetch(`${baseUrl}/api/workspaces/users`, {
      headers: { Authorization: `Bearer ${updatedMemberToken}` },
    });
    expect(memberListRes.status).toBe(403);

    const memberCreateRes = await fetch(`${baseUrl}/api/workspaces/users`, {
      method: "POST",
      headers: authHeaders(updatedMemberToken),
      body: JSON.stringify({
        username: "other-member",
        password: "other-member-secret",
      }),
    });
    expect(memberCreateRes.status).toBe(403);

    const memberDisableRes = await fetch(
      `${baseUrl}/api/workspaces/users/${owner.id}/disabled`,
      {
        method: "PATCH",
        headers: authHeaders(updatedMemberToken),
        body: JSON.stringify({ isDisabled: true }),
      },
    );
    expect(memberDisableRes.status).toBe(403);

    const memberResetRes = await fetch(
      `${baseUrl}/api/workspaces/users/${owner.id}/reset-password`,
      {
        method: "POST",
        headers: authHeaders(updatedMemberToken),
        body: JSON.stringify({ password: "owner-secret-2" }),
      },
    );
    expect(memberResetRes.status).toBe(403);

    const selfDisableRes = await fetch(
      `${baseUrl}/api/workspaces/users/${owner.id}/disabled`,
      {
        method: "PATCH",
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ isDisabled: true }),
      },
    );
    expect(selfDisableRes.status).toBe(400);
  });

  it("does not let hosted tenant owners manage users from another tenant", async () => {
    const ownerToken = await signup(baseUrl, "owner", "owner-secret");
    const owner = await getCurrentUser(baseUrl, ownerToken);
    await promoteUserToTenantOwner({
      userId: owner.id,
      tenantId: owner.workspaceId,
    });

    const usersRepo = await import("@server/repositories/users");
    const outsideUser = await usersRepo.createPrivateWorkspaceUser({
      username: "outside",
      displayName: "Outside User",
      password: "outside-secret",
    });

    const listRes = await fetch(`${baseUrl}/api/workspaces/users`, {
      headers: { Authorization: `Bearer ${ownerToken}` },
    });
    expect(listRes.status).toBe(200);
    const listBody = await listRes.json();
    expect(
      listBody.data.users.map((user: { username: string }) => user.username),
    ).not.toContain("outside");

    const resetOutsideRes = await fetch(
      `${baseUrl}/api/workspaces/users/${outsideUser.id}/reset-password`,
      {
        method: "POST",
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ password: "outside-secret-2" }),
      },
    );
    expect(resetOutsideRes.status).toBe(404);

    const disableOutsideRes = await fetch(
      `${baseUrl}/api/workspaces/users/${outsideUser.id}/disabled`,
      {
        method: "PATCH",
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ isDisabled: true }),
      },
    );
    expect(disableOutsideRes.status).toBe(404);
  });

  it("does not let hosted tenant owners manage other tenant owners", async () => {
    const ownerToken = await signup(baseUrl, "owner", "owner-secret");
    const owner = await getCurrentUser(baseUrl, ownerToken);
    await promoteUserToTenantOwner({
      userId: owner.id,
      tenantId: owner.workspaceId,
    });

    const coOwnerToken = await signup(baseUrl, "co-owner", "co-owner-secret");
    const coOwner = await getCurrentUser(baseUrl, coOwnerToken);
    await promoteUserToTenantOwner({
      userId: coOwner.id,
      tenantId: coOwner.workspaceId,
    });

    const resetCoOwnerRes = await fetch(
      `${baseUrl}/api/workspaces/users/${coOwner.id}/reset-password`,
      {
        method: "POST",
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ password: "co-owner-secret-2" }),
      },
    );
    expect(resetCoOwnerRes.status).toBe(403);

    const disableCoOwnerRes = await fetch(
      `${baseUrl}/api/workspaces/users/${coOwner.id}/disabled`,
      {
        method: "PATCH",
        headers: authHeaders(ownerToken),
        body: JSON.stringify({ isDisabled: true }),
      },
    );
    expect(disableCoOwnerRes.status).toBe(403);
  });
});
