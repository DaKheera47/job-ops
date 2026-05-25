import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock encryption - use a pass-through so tests don't need a real key
vi.mock("@infra/credentials-crypto", () => ({
  decryptCredential: vi.fn((v: string) => v),
}));

vi.mock("@server/repositories/post-application-integrations", () => ({
  getPostApplicationIntegration: vi.fn().mockResolvedValue({
    id: "integration-1",
    provider: "imap",
    accountKey: "default",
    displayName: "IMAP",
    status: "connected",
    credentials: {
      host: "imap.example.com",
      port: 993,
      user: "user@example.com",
      password: "secret",
      tls: true,
    },
    lastConnectedAt: null,
    lastSyncedAt: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  updatePostApplicationIntegrationSyncState: vi.fn().mockResolvedValue(null),
}));

vi.mock("@server/repositories/post-application-sync-runs", () => ({
  startPostApplicationSyncRun: vi
    .fn()
    .mockResolvedValue({ id: "sync-run-1", startedAt: Date.now() }),
  completePostApplicationSyncRun: vi.fn().mockResolvedValue(null),
}));

vi.mock("@server/repositories/jobs", () => ({
  getAllJobs: vi.fn().mockResolvedValue([
    {
      id: "job-1",
      employer: "Example Co",
      title: "Software Engineer",
      status: "applied",
    },
  ]),
}));

const getPostApplicationMessageByExternalId = vi.fn();
const upsertPostApplicationMessage = vi.fn();
vi.mock("@server/repositories/post-application-messages", () => ({
  getPostApplicationMessageByExternalId,
  upsertPostApplicationMessage,
}));

const transitionStage = vi.fn();
vi.mock("@server/services/applicationTracking", () => ({
  transitionStage,
}));

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
}));

vi.mock("@infra/product-analytics", () => ({
  trackServerProductEvent: vi.fn().mockResolvedValue(undefined),
}));

const listMessageIds = vi.fn();
const getMessagesFull = vi.fn();
vi.mock("@server/services/post-application/ingestion/imap-api", () => ({
  listMessageIds,
  getMessagesFull,
  buildEmailText: vi.fn(
    (msg: { subject: string; from: string }) =>
      `Subject: ${msg.subject}\nFrom: ${msg.from}`,
  ),
}));

const classifyWithSmartRouter = vi.fn();
vi.mock("@server/services/post-application/ingestion/email-router", () => ({
  classifyWithSmartRouter,
  minifyActiveJobs: vi.fn(
    (jobs: Array<{ id: string; employer: string; title: string }>) =>
      jobs.map((j) => ({ id: j.id, company: j.employer, title: j.title })),
  ),
}));

function makeMessage(
  overrides: Partial<{
    id: string;
    subject: string;
    from: string;
    fromName: string | null;
    receivedDate: Date;
    bodyPreview: string;
    bodyText: string;
  }> = {},
) {
  return {
    id: "uid-1",
    subject: "Interview update",
    from: "recruiter@example.com",
    fromName: "Recruiter",
    receivedDate: new Date(),
    bodyPreview: "We'd like to schedule an interview.",
    bodyText: "We'd like to schedule an interview.",
    ...overrides,
  };
}

function makeClassification(
  overrides: Partial<{
    bestMatchId: string | null;
    confidence: number;
    stageTarget: string;
    messageType: string;
    isRelevant: boolean;
    stageEventPayload: null;
    reason: string;
  }> = {},
) {
  return {
    bestMatchId: "job-1",
    confidence: 0.97,
    stageTarget: "assessment",
    messageType: "interview",
    isRelevant: true,
    stageEventPayload: null,
    reason: "Matches job application.",
    ...overrides,
  };
}

describe("runImapIngestionSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMessageIds.mockResolvedValue([1]);
    getMessagesFull.mockResolvedValue([makeMessage()]);
    classifyWithSmartRouter.mockResolvedValue(makeClassification());
    getPostApplicationMessageByExternalId.mockResolvedValue(null);
    upsertPostApplicationMessage.mockResolvedValue({
      id: "msg-1",
      processingStatus: "auto_linked",
    });
  });

  it("throws when integration is not found", async () => {
    const { getPostApplicationIntegration } = await import(
      "@server/repositories/post-application-integrations"
    );
    vi.mocked(getPostApplicationIntegration).mockResolvedValueOnce(null);

    const { runImapIngestionSync } = await import("./imap-sync");

    await expect(
      runImapIngestionSync({ accountKey: "default" }),
    ).rejects.toThrow("not connected");
  });

  it("returns zero counts when no UIDs found", async () => {
    listMessageIds.mockResolvedValue([]);

    const { runImapIngestionSync } = await import("./imap-sync");

    const summary = await runImapIngestionSync({ accountKey: "default" });

    expect(summary).toEqual({
      discovered: 0,
      relevant: 0,
      classified: 0,
      errored: 0,
    });
  });

  it("skips messages that already exist (deduplication)", async () => {
    getPostApplicationMessageByExternalId.mockResolvedValueOnce({
      id: "existing-msg",
      externalMessageId: "imap-imap.example.com-uid-1",
    });

    const { runImapIngestionSync } = await import("./imap-sync");

    const summary = await runImapIngestionSync({ accountKey: "default" });

    expect(upsertPostApplicationMessage).not.toHaveBeenCalled();
    expect(summary.discovered).toBe(1);
    expect(summary.relevant).toBe(0);
  });

  it("stores auto-linked message and triggers stage transition at >=95% confidence", async () => {
    classifyWithSmartRouter.mockResolvedValueOnce(
      makeClassification({ confidence: 0.97, stageTarget: "assessment" }),
    );

    const { runImapIngestionSync } = await import("./imap-sync");

    const summary = await runImapIngestionSync({ accountKey: "default" });

    expect(upsertPostApplicationMessage).toHaveBeenCalledOnce();
    const stored = vi.mocked(upsertPostApplicationMessage).mock.calls[0][0];
    expect(stored.processingStatus).toBe("auto_linked");
    expect(stored.matchedJobId).toBe("job-1");

    expect(transitionStage).toHaveBeenCalledOnce();
    expect(summary.relevant).toBe(1);
    expect(summary.classified).toBe(1);
  });

  it("stores pending_user message at 50-94% confidence without stage transition", async () => {
    classifyWithSmartRouter.mockResolvedValueOnce(
      makeClassification({ confidence: 0.75, stageTarget: "interview" }),
    );

    const { runImapIngestionSync } = await import("./imap-sync");

    const summary = await runImapIngestionSync({ accountKey: "default" });

    expect(upsertPostApplicationMessage).toHaveBeenCalledOnce();
    const stored = vi.mocked(upsertPostApplicationMessage).mock.calls[0][0];
    expect(stored.processingStatus).toBe("pending_user");
    expect(transitionStage).not.toHaveBeenCalled();
    expect(summary.relevant).toBe(1);
  });

  it("stores ignored message for non-relevant classification", async () => {
    classifyWithSmartRouter.mockResolvedValueOnce(
      makeClassification({
        bestMatchId: null,
        confidence: 0.1,
        isRelevant: false,
        stageTarget: "no_change",
        messageType: "other",
      }),
    );

    const { runImapIngestionSync } = await import("./imap-sync");

    const summary = await runImapIngestionSync({ accountKey: "default" });

    expect(upsertPostApplicationMessage).toHaveBeenCalledOnce();
    const stored = vi.mocked(upsertPostApplicationMessage).mock.calls[0][0];
    expect(stored.processingStatus).toBe("ignored");
    expect(summary.relevant).toBe(0);
    expect(summary.classified).toBe(0);
  });

  it("increments errored counter on per-message processing failure", async () => {
    classifyWithSmartRouter.mockRejectedValueOnce(
      new Error("LLM classification failed"),
    );

    const { runImapIngestionSync } = await import("./imap-sync");

    const summary = await runImapIngestionSync({ accountKey: "default" });

    expect(summary.errored).toBe(1);
    expect(summary.relevant).toBe(0);
  });

  it("completes the sync run with correct counts on success", async () => {
    const { completePostApplicationSyncRun } = await import(
      "@server/repositories/post-application-sync-runs"
    );

    const { runImapIngestionSync } = await import("./imap-sync");

    await runImapIngestionSync({ accountKey: "default" });

    expect(vi.mocked(completePostApplicationSyncRun)).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        messagesDiscovered: 1,
        messagesRelevant: 1,
        messagesClassified: 1,
      }),
    );
  });

  it("marks sync run as failed and rethrows when top-level error occurs", async () => {
    listMessageIds.mockRejectedValueOnce(new Error("IMAP connection failed"));

    const { completePostApplicationSyncRun } = await import(
      "@server/repositories/post-application-sync-runs"
    );

    const { runImapIngestionSync } = await import("./imap-sync");

    await expect(
      runImapIngestionSync({ accountKey: "default" }),
    ).rejects.toThrow("IMAP connection failed");

    expect(vi.mocked(completePostApplicationSyncRun)).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });
});
