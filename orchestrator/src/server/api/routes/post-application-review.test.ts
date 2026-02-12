import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type {
  PostApplicationMessage,
  PostApplicationRouterStageTarget,
} from "@shared/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Post-Application Review Workflow API", () => {
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

  async function seedPendingMessage(input?: {
    syncRunId?: string | null;
    matchedJobId?: string | null;
    stageTarget?: PostApplicationRouterStageTarget;
  }): Promise<{
    message: PostApplicationMessage;
    jobId: string;
  }> {
    const { createJob } = await import("../../repositories/jobs");
    const { upsertPostApplicationMessage } = await import(
      "../../repositories/post-application-messages"
    );

    const job = await createJob({
      source: "manual",
      title: "Front End JavaScript Developer",
      employer: "Roku Interactive",
      jobUrl: `https://example.com/jobs/${randomUUID()}`,
    });

    const { message } = await upsertPostApplicationMessage({
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
      syncRunId: input?.syncRunId ?? null,
      externalMessageId: randomUUID(),
      fromAddress: "roku@smartrecruiters.com",
      fromDomain: "smartrecruiters.com",
      senderName: "Roku",
      subject: "Interview invitation",
      receivedAt: Date.now(),
      snippet: "Please schedule an interview.",
      classificationLabel: "interview",
      classificationConfidence: 0.97,
      classificationPayload: {
        reason: "High confidence",
      },
      relevanceLlmScore: 97,
      relevanceDecision: "relevant",
      matchConfidence: 97,
      stageTarget: input?.stageTarget ?? "technical_interview",
      messageType:
        input?.stageTarget === "rejected" || input?.stageTarget === "withdrawn"
          ? "rejection"
          : "interview",
      stageEventPayload: { note: "from test" },
      processingStatus: "pending_user",
      matchedJobId:
        input?.matchedJobId === undefined ? job.id : input.matchedJobId,
    });

    return { message, jobId: job.id };
  }

  it("lists pending inbox items", async () => {
    const { message } = await seedPendingMessage();

    const res = await fetch(
      `${baseUrl}/api/post-application/inbox?provider=gmail&accountKey=default`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].message.id).toBe(message.id);
    expect(body.data.items[0].message.processingStatus).toBe("pending_user");
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("approves an inbox item and writes stage event", async () => {
    const { message, jobId } = await seedPendingMessage();
    const { db, schema } = await import("../../db");

    const res = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          jobId,
          decidedBy: "tester",
        }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.message.processingStatus).toBe("manual_linked");
    expect(body.data.message.matchedJobId).toBe(jobId);

    const stageRows = await db.select().from(schema.stageEvents);
    expect(stageRows.length).toBeGreaterThan(0);
  });

  it("returns conflict on second approve and increments sync-run approval once", async () => {
    const { startPostApplicationSyncRun, getPostApplicationSyncRunById } =
      await import("../../repositories/post-application-sync-runs");
    const run = await startPostApplicationSyncRun({
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
    });
    const { message, jobId } = await seedPendingMessage({ syncRunId: run.id });

    const firstRes = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          jobId,
          decidedBy: "tester",
        }),
      },
    );
    expect(firstRes.status).toBe(200);

    const secondRes = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          jobId,
          decidedBy: "tester",
        }),
      },
    );
    const secondBody = await secondRes.json();

    expect(secondRes.status).toBe(409);
    expect(secondBody.ok).toBe(false);
    expect(secondBody.error.code).toBe("CONFLICT");

    const updatedRun = await getPostApplicationSyncRunById(run.id);
    expect(updatedRun?.messagesApproved).toBe(1);
    expect(updatedRun?.messagesDenied).toBe(0);
  });

  it("denies an inbox item as ignored", async () => {
    const { message } = await seedPendingMessage();

    const denyRes = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/deny`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          decidedBy: "tester",
        }),
      },
    );
    const denyBody = await denyRes.json();

    expect(denyRes.status).toBe(200);
    expect(denyBody.ok).toBe(true);
    expect(denyBody.data.message.processingStatus).toBe("ignored");
    expect(denyBody.data.message.matchedJobId).toBeNull();
  });

  it("counts no-suggested-match approve items as skipped, not failed", async () => {
    await seedPendingMessage({ matchedJobId: null });

    const res = await fetch(`${baseUrl}/api/post-application/inbox/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        provider: "gmail",
        accountKey: "default",
        decidedBy: "tester",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.requested).toBe(1);
    expect(body.data.succeeded).toBe(0);
    expect(body.data.skipped).toBe(1);
    expect(body.data.failed).toBe(0);
    expect(body.data.results[0].ok).toBe(false);
    expect(body.data.results[0].error.code).toBe("NO_SUGGESTED_MATCH");
  });

  it("lists messages for a sync run", async () => {
    const { startPostApplicationSyncRun } = await import(
      "../../repositories/post-application-sync-runs"
    );
    const run = await startPostApplicationSyncRun({
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
    });
    const { message } = await seedPendingMessage({ syncRunId: run.id });

    const res = await fetch(
      `${baseUrl}/api/post-application/runs/${run.id}/messages?provider=gmail&accountKey=default`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.run.id).toBe(run.id);
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].message.id).toBe(message.id);
  });

  it("approves rejected target and sets closed stage with rejected outcome", async () => {
    const { message, jobId } = await seedPendingMessage({
      stageTarget: "rejected",
    });
    const { db, schema } = await import("../../db");

    const res = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          jobId,
        }),
      },
    );

    expect(res.status).toBe(200);

    const stageRows = await db.select().from(schema.stageEvents);
    expect(stageRows.at(-1)?.toStage).toBe("closed");
    expect(stageRows.at(-1)?.outcome).toBe("rejected");

    const jobRow = (await db.select().from(schema.jobs)).find(
      (job) => job.id === jobId,
    );
    expect(jobRow?.outcome).toBe("rejected");
  });

  it("approves withdrawn target and sets closed stage with withdrawn outcome", async () => {
    const { message, jobId } = await seedPendingMessage({
      stageTarget: "withdrawn",
    });
    const { db, schema } = await import("../../db");

    const res = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          jobId,
        }),
      },
    );

    expect(res.status).toBe(200);

    const stageRows = await db.select().from(schema.stageEvents);
    expect(stageRows.at(-1)?.toStage).toBe("closed");
    expect(stageRows.at(-1)?.outcome).toBe("withdrawn");

    const jobRow = (await db.select().from(schema.jobs)).find(
      (job) => job.id === jobId,
    );
    expect(jobRow?.outcome).toBe("withdrawn");
  });
});
