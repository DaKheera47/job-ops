import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PostApplicationMessage } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("post-application job emails service", () => {
  let tempDir: string;
  let createJob: typeof import("@server/repositories/jobs").createJob;
  let upsertPostApplicationMessage: typeof import("@server/repositories/post-application-messages").upsertPostApplicationMessage;
  let upsertConnectedPostApplicationIntegration: typeof import("@server/repositories/post-application-integrations").upsertConnectedPostApplicationIntegration;
  let listJobPostApplicationEmails: typeof import("./job-emails").listJobPostApplicationEmails;
  let db: typeof import("@server/db").db;
  let schema: typeof import("@server/db").schema;
  let runWithRequestContext: typeof import("@infra/request-context").runWithRequestContext;

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-job-emails-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";

    await import("@server/db/migrate");
    ({ createJob } = await import("@server/repositories/jobs"));
    ({ upsertPostApplicationMessage } = await import(
      "@server/repositories/post-application-messages"
    ));
    ({ upsertConnectedPostApplicationIntegration } = await import(
      "@server/repositories/post-application-integrations"
    ));
    ({ listJobPostApplicationEmails } = await import("./job-emails"));
    ({ db, schema } = await import("@server/db"));
    ({ runWithRequestContext } = await import("@infra/request-context"));
  });

  afterEach(async () => {
    const { closeDb } = await import("@server/db");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  async function seedMessage(input: {
    jobId: string;
    receivedAt: number;
    externalThreadId?: string | null;
    integrationId?: string | null;
    processingStatus?: PostApplicationMessage["processingStatus"];
    provider?: PostApplicationMessage["provider"];
  }): Promise<PostApplicationMessage> {
    const { message } = await upsertPostApplicationMessage({
      provider: input.provider ?? "gmail",
      accountKey: "default",
      integrationId: input.integrationId ?? null,
      syncRunId: null,
      externalMessageId: randomUUID(),
      externalThreadId: input.externalThreadId ?? `thread-${input.receivedAt}`,
      fromAddress: "recruiting@example.com",
      fromDomain: "example.com",
      senderName: "Recruiting",
      subject: `Update ${input.receivedAt}`,
      receivedAt: input.receivedAt,
      snippet: "Stored snippet",
      classificationLabel: "interview",
      classificationConfidence: 0.96,
      classificationPayload: null,
      relevanceLlmScore: 96,
      relevanceDecision: "relevant",
      matchConfidence: 96,
      stageTarget: "technical_interview",
      messageType: "interview",
      stageEventPayload: null,
      processingStatus: input.processingStatus ?? "auto_linked",
      matchedJobId: input.jobId,
    });
    return message;
  }

  it("lists tenant-scoped job emails newest first with limit metadata", async () => {
    await db.insert(schema.tenants).values({
      id: "tenant_other",
      name: "Other Tenant",
      slug: "other-tenant",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const integration = await upsertConnectedPostApplicationIntegration({
      provider: "gmail",
      accountKey: "default",
      displayName: "Primary Gmail",
      credentials: { refreshToken: "secret-refresh-token" },
    });
    const job = await createJob({
      source: "manual",
      title: "Frontend Engineer",
      employer: "Acme",
      jobUrl: `https://example.com/jobs/${randomUUID()}`,
    });

    const older = await seedMessage({
      jobId: job.id,
      receivedAt: 1_704_067_200_000,
      integrationId: integration.id,
    });
    const newer = await seedMessage({
      jobId: job.id,
      receivedAt: 1_704_153_600_000,
      integrationId: integration.id,
    });
    await runWithRequestContext(
      { requestId: "other-tenant", tenantId: "tenant_other" },
      () =>
        seedMessage({
          jobId: job.id,
          receivedAt: 1_704_240_000_000,
          integrationId: null,
        }),
    );

    const limited = await listJobPostApplicationEmails(job.id, 1);

    expect(limited.total).toBe(2);
    expect(limited.items).toHaveLength(1);
    expect(limited.items[0]?.message.id).toBe(newer.id);
    expect(limited.items[0]?.message.id).not.toBe(older.id);
    expect(limited.items[0]?.accountDisplayName).toBe("Primary Gmail");
    expect(limited.items[0]?.sourceUrl).toBe(
      `https://mail.google.com/mail/u/0/#all/${newer.externalThreadId}`,
    );
    expect(limited.items[0]).not.toHaveProperty("credentials");
  });

  it("returns 404 for a missing job before listing emails", async () => {
    await expect(
      listJobPostApplicationEmails("missing-job-id", 100),
    ).rejects.toMatchObject({
      status: 404,
      code: "NOT_FOUND",
    });
  });
});
