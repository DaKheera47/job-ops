import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/repositories/post-application-integrations", () => ({
  getPostApplicationIntegration: vi.fn().mockResolvedValue({
    id: "integration-1",
    provider: "gmail",
    accountKey: "default",
    displayName: "Gmail",
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

const upsertPostApplicationMessage = vi.fn();
vi.mock("@server/repositories/post-application-messages", () => ({
  upsertPostApplicationMessage,
}));

const transitionStage = vi.fn();
vi.mock("@server/services/applicationTracking", () => ({
  transitionStage,
}));

vi.mock("@server/repositories/settings", () => ({
  getSetting: vi.fn().mockResolvedValue(null),
}));

vi.mock("@server/services/llm-service", () => ({
  LlmService: class {
    callJson() {
      return Promise.resolve({
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
    }
  },
}));

function makeJsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

describe("gmail sync auto-log idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input);
        if (url.includes("/gmail/v1/users/me/messages?")) {
          return makeJsonResponse({
            messages: [{ id: "message-1", threadId: "thread-1" }],
          });
        }
        if (url.includes("message-1") && url.includes("format=metadata")) {
          return makeJsonResponse({
            id: "message-1",
            threadId: "thread-1",
            snippet: "snippet",
            payload: {
              headers: [
                { name: "From", value: "Recruiter <jobs@example.com>" },
                { name: "Subject", value: "Interview update" },
                { name: "Date", value: new Date().toUTCString() },
              ],
            },
          });
        }
        if (url.includes("message-1") && url.includes("format=full")) {
          return makeJsonResponse({
            id: "message-1",
            threadId: "thread-1",
            snippet: "snippet",
            payload: {
              mimeType: "text/plain",
              body: {
                data: Buffer.from("Hello").toString("base64url"),
              },
            },
          });
        }

        throw new Error(`Unexpected fetch URL in test: ${url}`);
      }),
    );
  });

  it("creates auto stage event only on first auto_linked transition", async () => {
    const { runGmailIngestionSync } = await import("./gmail-sync");

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

    await runGmailIngestionSync({ accountKey: "default", maxMessages: 1 });
    await runGmailIngestionSync({ accountKey: "default", maxMessages: 1 });

    expect(upsertPostApplicationMessage).toHaveBeenCalledTimes(2);
    expect(transitionStage).toHaveBeenCalledTimes(1);
  });
});
