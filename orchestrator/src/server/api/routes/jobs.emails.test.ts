import { randomUUID } from "node:crypto";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Jobs email routes", () => {
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

  async function seedJobEmail() {
    const { createJob } = await import("@server/repositories/jobs");
    const { upsertConnectedPostApplicationIntegration } = await import(
      "@server/repositories/post-application-integrations"
    );
    const { upsertPostApplicationMessage } = await import(
      "@server/repositories/post-application-messages"
    );
    const integration = await upsertConnectedPostApplicationIntegration({
      provider: "gmail",
      accountKey: "default",
      displayName: "Work Gmail",
      credentials: { refreshToken: "secret-refresh-token" },
    });
    const job = await createJob({
      source: "manual",
      title: "Lifecycle Engineer",
      employer: "Acme",
      jobUrl: `https://example.com/jobs/${randomUUID()}`,
    });
    const { message } = await upsertPostApplicationMessage({
      provider: "gmail",
      accountKey: "default",
      integrationId: integration.id,
      syncRunId: null,
      externalMessageId: randomUUID(),
      externalThreadId: "thread-route-1",
      fromAddress: "recruiting@example.com",
      fromDomain: "example.com",
      senderName: "Recruiting",
      subject: "Interview invite",
      receivedAt: 1_704_153_600_000,
      snippet: "Let's schedule an interview.",
      classificationLabel: "interview",
      classificationConfidence: 0.96,
      classificationPayload: null,
      relevanceLlmScore: 96,
      relevanceDecision: "relevant",
      matchConfidence: 96,
      stageTarget: "technical_interview",
      messageType: "interview",
      stageEventPayload: null,
      processingStatus: "auto_linked",
      matchedJobId: job.id,
    });

    return { job, message };
  }

  it("returns job-linked emails with Gmail source URLs", async () => {
    const { job, message } = await seedJobEmail();

    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/emails?limit=100`, {
      headers: { "x-request-id": "req-job-emails-success" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-job-emails-success");
    expect(body.ok).toBe(true);
    expect(body.meta.requestId).toBe("req-job-emails-success");
    expect(body.data.total).toBe(1);
    expect(body.data.items[0].message.id).toBe(message.id);
    expect(body.data.items[0].accountDisplayName).toBe("Work Gmail");
    expect(body.data.items[0].sourceUrl).toBe(
      "https://mail.google.com/mail/u/0/#all/thread-route-1",
    );
    expect(body.data.items[0]).not.toHaveProperty("credentials");
    expect(body.data.items[0].accountDisplayName).not.toContain(
      "secret-refresh-token",
    );
  });

  it("returns 404 for a missing job", async () => {
    const res = await fetch(`${baseUrl}/api/jobs/missing-job/emails`);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("returns 400 for an invalid limit", async () => {
    const { job } = await seedJobEmail();

    const res = await fetch(`${baseUrl}/api/jobs/${job.id}/emails?limit=201`);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(typeof body.meta.requestId).toBe("string");
  });
});
