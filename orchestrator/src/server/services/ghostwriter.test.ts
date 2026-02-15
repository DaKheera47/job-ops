import type { JobChatMessage } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestId: vi.fn(),
  buildJobChatPromptContext: vi.fn(),
  llmCallJson: vi.fn(),
  repo: {
    getOrCreateThreadForJob: vi.fn(),
    getThreadForJob: vi.fn(),
    listMessagesForThread: vi.fn(),
    getActiveRunForThread: vi.fn(),
    createMessage: vi.fn(),
    createRun: vi.fn(),
    updateMessage: vi.fn(),
    completeRun: vi.fn(),
    getMessageById: vi.fn(),
    getLatestAssistantMessage: vi.fn(),
    getRunById: vi.fn(),
  },
  settings: {
    getAllSettings: vi.fn(),
  },
}));

vi.mock("@infra/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@infra/request-context", () => ({
  getRequestId: mocks.getRequestId,
}));

vi.mock("./ghostwriter-context", () => ({
  buildJobChatPromptContext: mocks.buildJobChatPromptContext,
}));

vi.mock("../repositories/settings", () => ({
  getAllSettings: mocks.settings.getAllSettings,
}));

vi.mock("../repositories/ghostwriter", () => ({
  getOrCreateThreadForJob: mocks.repo.getOrCreateThreadForJob,
  getThreadForJob: mocks.repo.getThreadForJob,
  listMessagesForThread: mocks.repo.listMessagesForThread,
  getActiveRunForThread: mocks.repo.getActiveRunForThread,
  createMessage: mocks.repo.createMessage,
  createRun: mocks.repo.createRun,
  updateMessage: mocks.repo.updateMessage,
  completeRun: mocks.repo.completeRun,
  getMessageById: mocks.repo.getMessageById,
  getLatestAssistantMessage: mocks.repo.getLatestAssistantMessage,
  getRunById: mocks.repo.getRunById,
}));

vi.mock("./llm/service", () => ({
  LlmService: class {
    callJson = mocks.llmCallJson;
  },
}));

import {
  cancelRun,
  cancelRunForJob,
  regenerateMessage,
  sendMessage,
  sendMessageForJob,
} from "./ghostwriter";

const thread = {
  id: "thread-1",
  jobId: "job-1",
  title: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastMessageAt: null,
};

const baseUserMessage: JobChatMessage = {
  id: "user-1",
  threadId: "thread-1",
  jobId: "job-1",
  role: "user",
  content: "Tell me about this role",
  status: "complete",
  tokensIn: 6,
  tokensOut: null,
  version: 1,
  replacesMessageId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const baseAssistantMessage: JobChatMessage = {
  id: "assistant-1",
  threadId: "thread-1",
  jobId: "job-1",
  role: "assistant",
  content: "Draft response",
  status: "complete",
  tokensIn: 6,
  tokensOut: 4,
  version: 1,
  replacesMessageId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("ghostwriter service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getRequestId.mockReturnValue("req-123");
    mocks.settings.getAllSettings.mockResolvedValue({});
    mocks.buildJobChatPromptContext.mockResolvedValue({
      job: { id: "job-1" },
      style: {
        tone: "professional",
        formality: "medium",
        constraints: "",
        doNotUse: "",
      },
      systemPrompt: "system prompt",
      jobSnapshot: '{"job":"snapshot"}',
      profileSnapshot: "profile snapshot",
    });

    mocks.repo.getOrCreateThreadForJob.mockResolvedValue(thread);
    mocks.repo.getThreadForJob.mockResolvedValue(thread);
    mocks.repo.getActiveRunForThread.mockResolvedValue(null);
    mocks.repo.createRun.mockResolvedValue({
      id: "run-1",
      threadId: "thread-1",
      jobId: "job-1",
      status: "running",
      model: "model-a",
      provider: "openrouter",
      errorCode: null,
      errorMessage: null,
      startedAt: Date.now(),
      completedAt: null,
      requestId: "req-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mocks.repo.completeRun.mockResolvedValue(null);
    mocks.repo.updateMessage.mockResolvedValue(baseAssistantMessage);
    mocks.repo.getMessageById.mockResolvedValue(baseAssistantMessage);
    mocks.repo.listMessagesForThread.mockResolvedValue([
      baseUserMessage,
      baseAssistantMessage,
      {
        ...baseAssistantMessage,
        id: "tool-1",
        role: "tool",
      },
      {
        ...baseAssistantMessage,
        id: "failed-1",
        role: "assistant",
        status: "failed",
      },
    ]);
    mocks.llmCallJson.mockResolvedValue({
      success: true,
      data: { response: "Thanks for your question." },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends message, runs LLM, and returns user + assistant messages", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-partial",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-partial",
      content: "Thanks for your question.",
      status: "complete",
      tokensOut: 7,
    };

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue(assistantComplete);
    mocks.repo.getMessageById.mockResolvedValue(assistantComplete);

    const result = await sendMessageForJob({
      jobId: "job-1",
      content: "  Tell me about this role  ",
    });

    expect(result.runId).toBe("run-1");
    expect(result.userMessage.role).toBe("user");
    expect(result.assistantMessage?.role).toBe("assistant");
    expect(mocks.repo.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        requestId: "req-123",
      }),
    );

    const llmArg = mocks.llmCallJson.mock.calls[0][0];
    expect(llmArg.messages.at(-1)).toMatchObject({
      role: "user",
      content: "Tell me about this role",
    });
    expect(
      llmArg.messages.filter(
        (message: { role: string }) =>
          message.role !== "system" && message.role !== "user",
      ),
    ).toEqual([{ role: "assistant", content: "Draft response" }]);
  });

  it("rejects empty message content", async () => {
    await expect(
      sendMessage({
        jobId: "job-1",
        threadId: "thread-1",
        content: "   ",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });
  });

  it("cancels a running generation during streaming", async () => {
    vi.useFakeTimers();

    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-stream",
      content: "",
      status: "partial",
    };
    const assistantCancelled: JobChatMessage = {
      ...assistantPartial,
      status: "cancelled",
      content: "",
    };
    let cancelPromise: Promise<{
      cancelled: boolean;
      alreadyFinished: boolean;
    }> | null = null;

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue(assistantCancelled);
    mocks.repo.getMessageById.mockResolvedValue(assistantCancelled);
    mocks.repo.getRunById.mockResolvedValue({
      id: "run-1",
      threadId: "thread-1",
      jobId: "job-1",
      status: "running",
      model: "model-a",
      provider: "openrouter",
      errorCode: null,
      errorMessage: null,
      startedAt: Date.now(),
      completedAt: null,
      requestId: "req-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mocks.llmCallJson.mockImplementation(async () => {
      await vi.advanceTimersByTimeAsync(1);
      return {
        success: true,
        data: { response: "x".repeat(200) },
      };
    });

    const onReady = vi.fn(({ runId }: { runId: string }) => {
      cancelPromise = cancelRunForJob({ jobId: "job-1", runId });
    });
    const onCancelled = vi.fn();
    const onCompleted = vi.fn();

    const resultPromise = sendMessageForJob({
      jobId: "job-1",
      content: "Cancel this",
      stream: {
        onReady,
        onDelta: vi.fn(),
        onCompleted,
        onCancelled,
        onError: vi.fn(),
      },
    });

    await vi.runAllTimersAsync();
    const result = await resultPromise;
    await cancelPromise;

    expect(onReady).toHaveBeenCalled();
    expect(onCancelled).toHaveBeenCalled();
    expect(onCompleted).not.toHaveBeenCalled();
    expect(result.assistantMessage?.status).toBe("cancelled");
  });

  it("enforces regenerate only on latest assistant message", async () => {
    mocks.repo.getMessageById.mockResolvedValue(baseAssistantMessage);
    mocks.repo.getLatestAssistantMessage.mockResolvedValue({
      ...baseAssistantMessage,
      id: "assistant-latest",
    });

    await expect(
      regenerateMessage({
        jobId: "job-1",
        threadId: "thread-1",
        assistantMessageId: "assistant-1",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });
  });

  it("returns alreadyFinished when cancelling non-running run", async () => {
    mocks.repo.getRunById.mockResolvedValue({
      id: "run-finished",
      threadId: "thread-1",
      jobId: "job-1",
      status: "completed",
      model: "model-a",
      provider: "openrouter",
      errorCode: null,
      errorMessage: null,
      startedAt: Date.now(),
      completedAt: Date.now(),
      requestId: "req-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await cancelRun({
      jobId: "job-1",
      threadId: "thread-1",
      runId: "run-finished",
    });

    expect(result).toEqual({ cancelled: false, alreadyFinished: true });
    expect(mocks.repo.completeRun).not.toHaveBeenCalled();
  });
});
