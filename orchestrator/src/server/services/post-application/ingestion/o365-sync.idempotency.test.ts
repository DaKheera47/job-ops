import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/repositories/post-application-integrations", () => ({
  getPostApplicationIntegration: vi.fn().mockResolvedValue({
    id: "integration-1",
    provider: "o365",
    accountKey: "default",
    displayName: "O365",
    status: "connected",
    credentials: {
      refreshToken: "refresh-token",
      accessToken: "access-token",
      expiryDate: Date.now() + 60 * 60 * 1000,
    },
    lastConnectedAt: null,
    lastSyncedAt: null,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  updatePostApplicationIntegrationSyncState: vi.fn().mockResolvedValue(null),
  upsertConnectedPostApplicationIntegration: vi.fn().mockResolvedValue(null),
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
  trackServerProductEvent: vi.fn(),
}));

const resolveO365AccessTokenMock = vi.fn().mockResolvedValue({
  refreshToken: "refresh-token",
  accessToken: "access-token",
  expiryDate: Date.now() + 60 * 60 * 1000,
});

const llmCallJson = vi.fn().mockResolvedValue({
  success: true,
  data: {
    bestMatchIndex: 1,
    confidence: 99,
    stageTarget: "assessment",
    isRelevant: true,
    stageEventPayload: null,
    reason: "matches",
  },
});

vi.mock("@server/services/llm/service", () => ({
  LlmService: class {
    callJson() {
      return llmCallJson();
    }
  },
}));

vi.mock("./o365-api", () => ({
  resolveO365AccessToken: resolveO365AccessTokenMock,
  listMessageIds: vi
    .fn()
    .mockResolvedValue([{ id: "message-1", conversationId: "thread-1" }]),
  getMessageMetadata: vi.fn().mockResolvedValue({
    id: "message-1",
    conversationId: "thread-1",
    subject: "Interview update",
    bodyPreview: "snippet",
    from: { emailAddress: { name: "Recruiter", address: "jobs@example.com" } },
    receivedDateTime: new Date().toISOString(),
  }),
  getMessageFull: vi.fn().mockResolvedValue({
    id: "message-1",
    conversationId: "thread-1",
    subject: "Interview update",
    bodyPreview: "snippet",
    from: { emailAddress: { name: "Recruiter", address: "jobs@example.com" } },
    receivedDateTime: new Date().toISOString(),
    body: { contentType: "text", content: "Hello" },
  }),
  extractBodyText: vi.fn().mockReturnValue("Hello"),
  buildEmailText: vi.fn().mockReturnValue("From: Recruiter <jobs@example.com>"),
}));

describe("o365 sync auto-log idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    llmCallJson.mockClear();
    resolveO365AccessTokenMock.mockResolvedValue({
      refreshToken: "refresh-token",
      accessToken: "access-token",
      expiryDate: Date.now() + 60 * 60 * 1000,
    });
  });

  it("creates auto stage event only on first auto_linked transition", async () => {
    const { runO365IngestionSync } = await import("./o365-sync");

    getPostApplicationMessageByExternalId
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "post-msg-1",
        provider: "o365",
        accountKey: "default",
        integrationId: "integration-1",
        syncRunId: "sync-run-1",
        externalMessageId: "message-1",
        externalThreadId: "thread-1",
        fromAddress: "jobs@example.com",
        fromDomain: "example.com",
        senderName: "Recruiter",
        subject: "Interview update",
        receivedAt: Date.now(),
        snippet: "snippet",
        classificationLabel: "assessment",
        classificationConfidence: 0.99,
        classificationPayload: { method: "smart_router", reason: "matches" },
        relevanceLlmScore: 99,
        relevanceDecision: "relevant",
        matchedJobId: "job-1",
        matchConfidence: 99,
        stageTarget: "assessment",
        messageType: "interview",
        stageEventPayload: null,
        processingStatus: "auto_linked",
        decidedAt: null,
        decidedBy: null,
        errorCode: null,
        errorMessage: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

    upsertPostApplicationMessage
      .mockResolvedValueOnce({
        message: {
          id: "post-msg-1",
          matchedJobId: "job-1",
          processingStatus: "auto_linked",
          stageTarget: "assessment",
          receivedAt: Date.now(),
        },
        wasCreated: true,
        previousProcessingStatus: null,
        autoLinkTransitioned: true,
      })
      .mockResolvedValueOnce({
        message: {
          id: "post-msg-1",
          matchedJobId: "job-1",
          processingStatus: "auto_linked",
          stageTarget: "assessment",
          receivedAt: Date.now(),
        },
        wasCreated: false,
        previousProcessingStatus: "auto_linked",
        autoLinkTransitioned: false,
      });

    await runO365IngestionSync({ accountKey: "default", maxMessages: 1 });
    await runO365IngestionSync({ accountKey: "default", maxMessages: 1 });

    expect(upsertPostApplicationMessage).toHaveBeenCalledTimes(2);
    expect(transitionStage).toHaveBeenCalledTimes(1);
  });

  it("persists rotated refresh tokens even when the access token payload is otherwise unchanged", async () => {
    const { upsertConnectedPostApplicationIntegration } = await import(
      "@server/repositories/post-application-integrations"
    );
    const { runO365IngestionSync } = await import("./o365-sync");

    resolveO365AccessTokenMock.mockResolvedValueOnce({
      refreshToken: "rotated-refresh-token",
      accessToken: "access-token",
      expiryDate: Date.now() + 60 * 60 * 1000,
    });
    getPostApplicationMessageByExternalId.mockResolvedValueOnce(null);
    upsertPostApplicationMessage.mockResolvedValueOnce({
      message: {
        id: "post-msg-1",
        matchedJobId: "job-1",
        processingStatus: "auto_linked",
        stageTarget: "assessment",
        receivedAt: Date.now(),
      },
      wasCreated: true,
      previousProcessingStatus: null,
      autoLinkTransitioned: true,
    });

    await runO365IngestionSync({ accountKey: "default", maxMessages: 1 });

    expect(upsertConnectedPostApplicationIntegration).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "o365",
        accountKey: "default",
        credentials: expect.objectContaining({
          refreshToken: "rotated-refresh-token",
          accessToken: "access-token",
        }),
      }),
    );
  });
});
