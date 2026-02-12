import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import type { PostApplicationMessage } from "@shared/types";
import { eq } from "drizzle-orm";
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
  }): Promise<{
    message: PostApplicationMessage;
    jobId: string;
    candidateId: string;
  }> {
    const { createJob } = await import("../../repositories/jobs");
    const { replacePostApplicationMessageCandidates } = await import(
      "../../repositories/post-application-message-candidates"
    );
    const { upsertPostApplicationMessage } = await import(
      "../../repositories/post-application-messages"
    );

    const job = await createJob({
      source: "manual",
      title: "Front End JavaScript Developer",
      employer: "Roku Interactive",
      jobUrl: `https://example.com/jobs/${randomUUID()}`,
    });

    const message = await upsertPostApplicationMessage({
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
      syncRunId: input?.syncRunId ?? null,
      externalMessageId: randomUUID(),
      fromAddress: "roku@smartrecruiters.com",
      fromDomain: "smartrecruiters.com",
      senderName: "Roku",
      subject: "Thank you for applying to Roku Interactive",
      receivedAt: Date.now(),
      snippet:
        "Your application for Front End JavaScript Developer has been received",
      classificationLabel: "Application confirmation",
      classificationConfidence: 0.97,
      classificationPayload: {
        companyName: "Roku Interactive",
        jobTitle: "Front End JavaScript Developer",
      },
      relevanceKeywordScore: 97,
      relevanceLlmScore: null,
      relevanceFinalScore: 97,
      relevanceDecision: "relevant",
      reviewStatus: "pending_review",
    });

    const [candidate] = await replacePostApplicationMessageCandidates({
      messageId: message.id,
      candidates: [
        {
          jobId: job.id,
          score: 97,
          rank: 1,
          reasons: ["company:40", "title:30", "domain:20", "time:7"],
          matchMethod: "keyword",
          isHighConfidence: true,
        },
      ],
    });

    return { message, jobId: job.id, candidateId: candidate.id };
  }

  async function seedNoReliableMatchMessage(): Promise<{
    message: PostApplicationMessage;
    jobId: string;
  }> {
    const { createJob } = await import("../../repositories/jobs");
    const { upsertPostApplicationMessage } = await import(
      "../../repositories/post-application-messages"
    );

    const job = await createJob({
      source: "manual",
      title: "Software Engineer",
      employer: "Acme Corp",
      jobUrl: `https://example.com/jobs/${randomUUID()}`,
    });

    const message = await upsertPostApplicationMessage({
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
      syncRunId: null,
      externalMessageId: randomUUID(),
      fromAddress: "careers@acme.com",
      fromDomain: "acme.com",
      senderName: "Acme Careers",
      subject: "Application update",
      receivedAt: Date.now(),
      snippet: "Thanks for applying. We have an update.",
      classificationLabel: "Application update",
      classificationConfidence: 0.9,
      classificationPayload: {
        companyName: "Acme Corp",
      },
      relevanceKeywordScore: 88,
      relevanceLlmScore: null,
      relevanceFinalScore: 88,
      relevanceDecision: "relevant",
      reviewStatus: "no_reliable_match",
    });

    return { message, jobId: job.id };
  }

  it("lists pending inbox items with candidates", async () => {
    const { message, candidateId, jobId } = await seedPendingMessage();

    const res = await fetch(
      `${baseUrl}/api/post-application/inbox?provider=gmail&accountKey=default`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].message.id).toBe(message.id);
    expect(body.data.items[0].candidates[0].id).toBe(candidateId);
    expect(body.data.items[0].candidates[0].jobId).toBe(jobId);
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("hides stale pending messages when a link decision already exists", async () => {
    const { message, jobId, candidateId } = await seedPendingMessage();
    const { createPostApplicationMessageLink } = await import(
      "../../repositories/post-application-message-links"
    );

    await createPostApplicationMessageLink({
      messageId: message.id,
      jobId,
      candidateId,
      decision: "approved",
      decidedAt: Date.now(),
      decidedBy: "tester",
    });

    const res = await fetch(
      `${baseUrl}/api/post-application/inbox?provider=gmail&accountKey=default`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(0);
  });

  it("includes no_reliable_match messages in inbox for manual assignment", async () => {
    const { message } = await seedNoReliableMatchMessage();

    const res = await fetch(
      `${baseUrl}/api/post-application/inbox?provider=gmail&accountKey=default`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].message.id).toBe(message.id);
    expect(body.data.items[0].message.reviewStatus).toBe("no_reliable_match");
    expect(body.data.items[0].candidates).toHaveLength(0);
  });

  it("approves an inbox item and writes stage event + decision", async () => {
    const { message, candidateId, jobId } = await seedPendingMessage();
    const { db, schema } = await import("../../db");
    const { getPostApplicationMessageById } = await import(
      "../../repositories/post-application-messages"
    );

    const res = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          candidateId,
          decidedBy: "tester",
          note: "Looks good",
        }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.message.reviewStatus).toBe("approved");
    expect(body.data.message.matchedJobId).toBe(jobId);

    const links = await db.select().from(schema.postApplicationMessageLinks);
    expect(links).toHaveLength(1);
    expect(links[0]?.decision).toBe("approved");
    expect(links[0]?.stageEventId).toBeTruthy();

    const stageRows = await db
      .select()
      .from(schema.stageEvents)
      .where(eq(schema.stageEvents.applicationId, jobId));
    expect(stageRows).toHaveLength(1);
    expect(stageRows[0]?.occurredAt).toBe(
      Math.floor(message.receivedAt / 1000),
    );

    const updatedMessage = await getPostApplicationMessageById(message.id);
    expect(updatedMessage?.reviewStatus).toBe("approved");
  });

  it("approves a no_reliable_match message with explicit jobId", async () => {
    const { message, jobId } = await seedNoReliableMatchMessage();

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
    expect(body.data.message.reviewStatus).toBe("approved");
    expect(body.data.message.matchedJobId).toBe(jobId);
  });

  it("denies an inbox item and keeps it out of pending queue", async () => {
    const { message, candidateId, jobId } = await seedPendingMessage();
    const { db, schema } = await import("../../db");

    const denyRes = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/deny`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          candidateId,
          decidedBy: "tester",
          note: "Not this role",
        }),
      },
    );
    const denyBody = await denyRes.json();

    expect(denyRes.status).toBe(200);
    expect(denyBody.ok).toBe(true);
    expect(denyBody.data.message.reviewStatus).toBe("denied");
    expect(denyBody.data.message.matchedJobId).toBe(jobId);

    const links = await db.select().from(schema.postApplicationMessageLinks);
    expect(links).toHaveLength(1);
    expect(links[0]?.decision).toBe("denied");
    expect(links[0]?.stageEventId).toBeNull();

    const inboxRes = await fetch(
      `${baseUrl}/api/post-application/inbox?provider=gmail&accountKey=default`,
    );
    const inboxBody = await inboxRes.json();
    expect(inboxRes.status).toBe(200);
    expect(inboxBody.data.total).toBe(0);
  });

  it("increments run approved counter when approving a run message", async () => {
    const { startPostApplicationSyncRun, getPostApplicationSyncRunById } =
      await import("../../repositories/post-application-sync-runs");
    const run = await startPostApplicationSyncRun({
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
    });
    const { message, candidateId } = await seedPendingMessage({
      syncRunId: run.id,
    });

    const approveRes = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          candidateId,
        }),
      },
    );
    expect(approveRes.status).toBe(200);

    const updatedRun = await getPostApplicationSyncRunById(run.id);
    expect(updatedRun?.messagesApproved).toBe(1);
    expect(updatedRun?.messagesDenied).toBe(0);
  });

  it("increments run denied counter when denying a run message", async () => {
    const { startPostApplicationSyncRun, getPostApplicationSyncRunById } =
      await import("../../repositories/post-application-sync-runs");
    const run = await startPostApplicationSyncRun({
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
    });
    const { message, candidateId } = await seedPendingMessage({
      syncRunId: run.id,
    });

    const denyRes = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/deny`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          candidateId,
        }),
      },
    );
    expect(denyRes.status).toBe(200);

    const updatedRun = await getPostApplicationSyncRunById(run.id);
    expect(updatedRun?.messagesApproved).toBe(0);
    expect(updatedRun?.messagesDenied).toBe(1);
  });

  it("keeps approved review status when same external message is re-ingested", async () => {
    const { message, candidateId } = await seedPendingMessage();
    const { upsertPostApplicationMessage } = await import(
      "../../repositories/post-application-messages"
    );

    const approveUrl = `${baseUrl}/api/post-application/inbox/${message.id}/approve`;
    const first = await fetch(approveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "gmail",
        accountKey: "default",
        candidateId,
      }),
    });
    expect(first.status).toBe(200);

    await upsertPostApplicationMessage({
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
      syncRunId: null,
      externalMessageId: message.externalMessageId,
      externalThreadId: message.externalThreadId,
      fromAddress: message.fromAddress,
      fromDomain: message.fromDomain,
      senderName: message.senderName,
      subject: message.subject,
      receivedAt: Date.now(),
      snippet: "Updated snippet from re-ingestion",
      classificationLabel: message.classificationLabel,
      classificationConfidence: message.classificationConfidence,
      classificationPayload: message.classificationPayload,
      relevanceKeywordScore: 95,
      relevanceLlmScore: null,
      relevanceFinalScore: 95,
      relevanceDecision: "relevant",
      reviewStatus: "pending_review",
    });

    const denyRes = await fetch(
      `${baseUrl}/api/post-application/inbox/${message.id}/deny`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "gmail",
          accountKey: "default",
          candidateId,
        }),
      },
    );
    const denyBody = await denyRes.json();
    expect(denyRes.status).toBe(409);
    expect(denyBody.ok).toBe(false);
    expect(denyBody.error.code).toBe("CONFLICT");
  });

  it("returns 409 when approving an already decided message", async () => {
    const { message, candidateId } = await seedPendingMessage();

    const approveUrl = `${baseUrl}/api/post-application/inbox/${message.id}/approve`;

    const first = await fetch(approveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "gmail",
        accountKey: "default",
        candidateId,
      }),
    });
    expect(first.status).toBe(200);

    const second = await fetch(approveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "gmail",
        accountKey: "default",
        candidateId,
      }),
    });
    const body = await second.json();

    expect(second.status).toBe(409);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("CONFLICT");
  });

  it("lists sync runs", async () => {
    const { startPostApplicationSyncRun, completePostApplicationSyncRun } =
      await import("../../repositories/post-application-sync-runs");

    const run = await startPostApplicationSyncRun({
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
    });
    await completePostApplicationSyncRun({
      id: run.id,
      status: "completed",
      messagesDiscovered: 10,
      messagesRelevant: 8,
      messagesClassified: 8,
      messagesMatched: 6,
      messagesApproved: 4,
      messagesDenied: 1,
      messagesErrored: 0,
    });

    const res = await fetch(
      `${baseUrl}/api/post-application/runs?provider=gmail&accountKey=default`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(1);
    expect(body.data.runs[0].id).toBe(run.id);
    expect(body.data.runs[0].messagesMatched).toBe(6);
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

  it("validates message id params", async () => {
    const res = await fetch(
      `${baseUrl}/api/post-application/inbox/not-a-uuid/approve`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "gmail", accountKey: "default" }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
  });
});
