import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe.sequential("post-application message upsert transition semantics", () => {
  let tempDir: string;
  let upsertPostApplicationMessage: typeof import("./post-application-messages").upsertPostApplicationMessage;

  async function upsertMessage(args: {
    externalMessageId: string;
    processingStatus:
      | "pending_user"
      | "auto_linked"
      | "manual_linked"
      | "ignored";
  }) {
    return upsertPostApplicationMessage({
      provider: "gmail",
      accountKey: "default",
      integrationId: null,
      syncRunId: null,
      externalMessageId: args.externalMessageId,
      externalThreadId: "thread-1",
      fromAddress: "no-reply@example.com",
      fromDomain: "example.com",
      senderName: "Example",
      subject: "Status update",
      receivedAt: Date.now(),
      snippet: "snippet",
      classificationLabel: "assessment",
      classificationConfidence: 0.95,
      classificationPayload: { reason: "test" },
      relevanceLlmScore: 95,
      relevanceDecision: "relevant",
      matchConfidence: 95,
      stageTarget: "assessment",
      messageType: "update",
      stageEventPayload: { note: "test" },
      processingStatus: args.processingStatus,
      matchedJobId: null,
    });
  }

  beforeEach(async () => {
    vi.resetModules();
    tempDir = await mkdtemp(join(tmpdir(), "job-ops-post-app-msgs-"));
    process.env.DATA_DIR = tempDir;
    process.env.NODE_ENV = "test";

    await import("../db/migrate");
    ({ upsertPostApplicationMessage } = await import(
      "./post-application-messages"
    ));
  });

  afterEach(async () => {
    const { closeDb } = await import("../db/index");
    closeDb();
    await rm(tempDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("marks inserted auto_linked rows as transitioned", async () => {
    const result = await upsertMessage({
      externalMessageId: randomUUID(),
      processingStatus: "auto_linked",
    });

    expect(result.wasCreated).toBe(true);
    expect(result.previousProcessingStatus).toBeNull();
    expect(result.autoLinkTransitioned).toBe(true);
    expect(result.message.processingStatus).toBe("auto_linked");
  });

  it("does not transition auto_linked rows on repeated upserts", async () => {
    const externalMessageId = randomUUID();
    await upsertMessage({
      externalMessageId,
      processingStatus: "auto_linked",
    });

    const second = await upsertMessage({
      externalMessageId,
      processingStatus: "auto_linked",
    });

    expect(second.wasCreated).toBe(false);
    expect(second.previousProcessingStatus).toBe("auto_linked");
    expect(second.autoLinkTransitioned).toBe(false);
    expect(second.message.processingStatus).toBe("auto_linked");
  });

  it("marks pending_user -> auto_linked as transitioned", async () => {
    const externalMessageId = randomUUID();
    await upsertMessage({
      externalMessageId,
      processingStatus: "pending_user",
    });

    const second = await upsertMessage({
      externalMessageId,
      processingStatus: "auto_linked",
    });

    expect(second.wasCreated).toBe(false);
    expect(second.previousProcessingStatus).toBe("pending_user");
    expect(second.autoLinkTransitioned).toBe(true);
    expect(second.message.processingStatus).toBe("auto_linked");
  });

  it("preserves terminal statuses and does not mark auto-link transition", async () => {
    const externalMessageId = randomUUID();
    await upsertMessage({
      externalMessageId,
      processingStatus: "manual_linked",
    });

    const second = await upsertMessage({
      externalMessageId,
      processingStatus: "auto_linked",
    });

    expect(second.wasCreated).toBe(false);
    expect(second.previousProcessingStatus).toBe("manual_linked");
    expect(second.autoLinkTransitioned).toBe(false);
    expect(second.message.processingStatus).toBe("manual_linked");
  });
});
