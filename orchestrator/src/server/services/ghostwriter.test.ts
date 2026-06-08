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
    completeRunIfRunning: vi.fn(),
    getMessageById: vi.fn(),
    getLatestAssistantMessage: vi.fn(),
    getRunById: vi.fn(),
    getActivePathFromRoot: vi.fn(),
    getAncestorPath: vi.fn(),
    setActiveChild: vi.fn(),
    setActiveRoot: vi.fn(),
    getSiblingsOf: vi.fn(),
    getChildrenOfMessage: vi.fn(),
    updateThreadContext: vi.fn(),
  },
  jobsRepo: {
    getJobById: vi.fn(),
    listJobNotesByIds: vi.fn(),
  },
  jobDocumentsRepo: {
    listJobDocumentsByIds: vi.fn(),
  },
  jobEmails: {
    listJobPostApplicationEmailsByIds: vi.fn(),
  },
  settings: {
    getAllSettings: vi.fn(),
  },
  resolveLlmRuntimeSettings: vi.fn(),
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
  getTenantId: vi.fn(() => "tenant_default"),
}));

vi.mock("./ghostwriter-context", () => ({
  buildJobChatPromptContext: mocks.buildJobChatPromptContext,
  canUseJobDocumentForGhostwriterContext: vi.fn(() => true),
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
  completeRunIfRunning: mocks.repo.completeRunIfRunning,
  getMessageById: mocks.repo.getMessageById,
  getLatestAssistantMessage: mocks.repo.getLatestAssistantMessage,
  getRunById: mocks.repo.getRunById,
  getActivePathFromRoot: mocks.repo.getActivePathFromRoot,
  getAncestorPath: mocks.repo.getAncestorPath,
  setActiveChild: mocks.repo.setActiveChild,
  getSiblingsOf: mocks.repo.getSiblingsOf,
  getChildrenOfMessage: mocks.repo.getChildrenOfMessage,
  setActiveRoot: mocks.repo.setActiveRoot,
  updateThreadContext: mocks.repo.updateThreadContext,
}));

vi.mock("../repositories/jobs", () => ({
  getJobById: mocks.jobsRepo.getJobById,
  listJobNotesByIds: mocks.jobsRepo.listJobNotesByIds,
}));

vi.mock("../repositories/job-documents", () => ({
  listJobDocumentsByIds: mocks.jobDocumentsRepo.listJobDocumentsByIds,
}));

vi.mock("./post-application/job-emails", () => ({
  listJobPostApplicationEmailsByIds:
    mocks.jobEmails.listJobPostApplicationEmailsByIds,
}));

vi.mock("./modelSelection", () => ({
  resolveLlmRuntimeSettings: mocks.resolveLlmRuntimeSettings,
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
  activeRootMessageId: "user-1",
  selectedNoteIds: [],
  selectedEmailIds: [],
  selectedDocumentIds: [],
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
  parentMessageId: null,
  activeChildId: "assistant-1",
  attachments: [],
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
  parentMessageId: "user-1",
  activeChildId: null,
  attachments: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe("ghostwriter service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getRequestId.mockReturnValue("req-123");
    mocks.settings.getAllSettings.mockResolvedValue({});
    mocks.resolveLlmRuntimeSettings.mockResolvedValue({
      model: "gpt-4o-mini",
      provider: "openai",
      baseUrl: null,
      apiKey: "test-key",
    });
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
      selectedNotesSnapshot: "",
      selectedEmailsSnapshot: "",
      selectedDocumentsSnapshot: "",
    });

    mocks.jobsRepo.listJobNotesByIds.mockResolvedValue([]);
    mocks.jobsRepo.getJobById.mockResolvedValue({ id: "job-1" });
    mocks.jobDocumentsRepo.listJobDocumentsByIds.mockResolvedValue([]);
    mocks.jobEmails.listJobPostApplicationEmailsByIds.mockResolvedValue([]);
    mocks.repo.getOrCreateThreadForJob.mockResolvedValue(thread);
    mocks.repo.getThreadForJob.mockResolvedValue(thread);
    mocks.repo.updateThreadContext.mockResolvedValue(thread);
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
    mocks.repo.completeRunIfRunning.mockResolvedValue({
      id: "run-1",
      threadId: "thread-1",
      jobId: "job-1",
      status: "cancelled",
      model: "model-a",
      provider: "openrouter",
      errorCode: "REQUEST_TIMEOUT",
      errorMessage: "Generation cancelled by user",
      startedAt: Date.now(),
      completedAt: Date.now(),
      requestId: "req-123",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
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
    mocks.repo.getActivePathFromRoot.mockResolvedValue([
      baseUserMessage,
      baseAssistantMessage,
    ]);
    mocks.repo.getAncestorPath.mockResolvedValue([
      baseUserMessage,
      baseAssistantMessage,
    ]);
    mocks.repo.setActiveChild.mockResolvedValue(undefined);
    mocks.repo.setActiveRoot.mockResolvedValue(undefined);
    mocks.repo.getSiblingsOf.mockResolvedValue({
      siblings: [baseAssistantMessage],
      activeIndex: 0,
    });
    mocks.llmCallJson.mockResolvedValue({
      success: true,
      data: { response: "Thanks for your question." },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
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

  it("saves selected notes before building prompt context", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-with-notes",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...assistantPartial,
      content: "Noted.",
      status: "complete",
    };
    const threadWithNotes = {
      ...thread,
      selectedNoteIds: ["note-1"],
    };

    mocks.jobsRepo.listJobNotesByIds.mockResolvedValue([
      {
        id: "note-1",
        jobId: "job-1",
        title: "Recruiter call",
        content: "Interview loop focuses on systems design.",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    mocks.repo.updateThreadContext.mockResolvedValue(threadWithNotes);
    mocks.repo.getThreadForJob
      .mockResolvedValueOnce(thread)
      .mockResolvedValueOnce(threadWithNotes);
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
      selectedNotesSnapshot: "Selected Job Notes:\nNote 1: Recruiter call",
      selectedEmailsSnapshot: "",
      selectedDocumentsSnapshot: "",
    });
    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue(assistantComplete);
    mocks.repo.getMessageById.mockResolvedValue(assistantComplete);

    await sendMessageForJob({
      jobId: "job-1",
      content: "Prep me",
      selectedNoteIds: ["note-1"],
    });

    expect(mocks.jobsRepo.listJobNotesByIds).toHaveBeenCalledWith("job-1", [
      "note-1",
    ]);
    expect(mocks.repo.updateThreadContext).toHaveBeenCalledWith({
      jobId: "job-1",
      threadId: "thread-1",
      selectedNoteIds: ["note-1"],
      selectedEmailIds: undefined,
      selectedDocumentIds: undefined,
    });
    expect(mocks.buildJobChatPromptContext).toHaveBeenCalledWith(
      "job-1",
      ["note-1"],
      [],
      [],
    );
    expect(mocks.llmCallJson.mock.calls[0][0].messages).toContainEqual({
      role: "system",
      content: "Selected Job Notes:\nNote 1: Recruiter call",
    });
  });

  it("saves selected emails before building prompt context", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-with-emails",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...assistantPartial,
      content: "Email-aware reply.",
      status: "complete",
    };
    const threadWithEmails = {
      ...thread,
      selectedEmailIds: ["email-1"],
    };

    mocks.jobEmails.listJobPostApplicationEmailsByIds.mockResolvedValue([
      {
        message: {
          id: "email-1",
          provider: "gmail",
          accountKey: "default",
          integrationId: null,
          syncRunId: null,
          externalMessageId: "gmail-1",
          externalThreadId: "thread-ext-1",
          fromAddress: "recruiter@example.com",
          fromDomain: "example.com",
          senderName: "Recruiter",
          subject: "Interview update",
          receivedAt: 1_767_225_600_000,
          snippet: "Can you share your availability?",
          classificationLabel: null,
          classificationConfidence: null,
          classificationPayload: null,
          relevanceLlmScore: null,
          relevanceDecision: "relevant",
          matchedJobId: "job-1",
          matchConfidence: 91,
          stageTarget: "recruiter_screen",
          messageType: "interview",
          stageEventPayload: null,
          processingStatus: "auto_linked",
          decidedAt: null,
          decidedBy: null,
          errorCode: null,
          errorMessage: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        accountDisplayName: "Work Gmail",
        sourceUrl: "https://mail.google.com/mail/u/0/#all/thread-ext-1",
      },
    ]);
    mocks.repo.updateThreadContext.mockResolvedValue(threadWithEmails);
    mocks.repo.getThreadForJob
      .mockResolvedValueOnce(thread)
      .mockResolvedValueOnce(threadWithEmails);
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
      selectedNotesSnapshot: "",
      selectedEmailsSnapshot: "Selected Job Emails:\nEmail 1: Interview update",
      selectedDocumentsSnapshot: "",
    });
    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue(assistantComplete);
    mocks.repo.getMessageById.mockResolvedValue(assistantComplete);

    await sendMessageForJob({
      jobId: "job-1",
      content: "Use the email",
      selectedEmailIds: ["email-1"],
    });

    expect(
      mocks.jobEmails.listJobPostApplicationEmailsByIds,
    ).toHaveBeenCalledWith("job-1", ["email-1"]);
    expect(mocks.repo.updateThreadContext).toHaveBeenCalledWith({
      jobId: "job-1",
      threadId: "thread-1",
      selectedNoteIds: undefined,
      selectedEmailIds: ["email-1"],
      selectedDocumentIds: undefined,
    });
    expect(mocks.buildJobChatPromptContext).toHaveBeenCalledWith(
      "job-1",
      [],
      ["email-1"],
      [],
    );
    expect(mocks.llmCallJson.mock.calls[0][0].messages).toContainEqual({
      role: "system",
      content: "Selected Job Emails:\nEmail 1: Interview update",
    });
  });

  it("saves selected documents before building prompt context", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-with-documents",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...assistantPartial,
      content: "Document-aware reply.",
      status: "complete",
    };
    const threadWithDocuments = {
      ...thread,
      selectedDocumentIds: ["doc-1"],
    };

    mocks.jobDocumentsRepo.listJobDocumentsByIds.mockResolvedValue([
      {
        id: "doc-1",
        jobId: "job-1",
        fileName: "take-home.md",
        mediaType: "text/markdown",
        byteSize: 120,
        storagePath: "/tmp/take-home.md",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    mocks.repo.updateThreadContext.mockResolvedValue(threadWithDocuments);
    mocks.repo.getThreadForJob
      .mockResolvedValueOnce(thread)
      .mockResolvedValueOnce(threadWithDocuments);
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
      selectedNotesSnapshot: "",
      selectedEmailsSnapshot: "",
      selectedDocumentsSnapshot:
        "Selected Job Documents:\nDocument 1: take-home.md",
    });
    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue(assistantComplete);
    mocks.repo.getMessageById.mockResolvedValue(assistantComplete);

    await sendMessageForJob({
      jobId: "job-1",
      content: "Use the document",
      selectedDocumentIds: ["doc-1"],
    });

    expect(mocks.jobDocumentsRepo.listJobDocumentsByIds).toHaveBeenCalledWith(
      "job-1",
      ["doc-1"],
    );
    expect(mocks.repo.updateThreadContext).toHaveBeenCalledWith({
      jobId: "job-1",
      threadId: "thread-1",
      selectedNoteIds: undefined,
      selectedEmailIds: undefined,
      selectedDocumentIds: ["doc-1"],
    });
    expect(mocks.buildJobChatPromptContext).toHaveBeenCalledWith(
      "job-1",
      [],
      [],
      ["doc-1"],
    );
    expect(mocks.llmCallJson.mock.calls[0][0].messages).toContainEqual({
      role: "system",
      content: "Selected Job Documents:\nDocument 1: take-home.md",
    });
  });

  it("passes screenshot attachments as image input when the model supports them", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-with-image",
      content: "",
      status: "partial",
    };
    const assistantComplete: JobChatMessage = {
      ...assistantPartial,
      content: "I can see the screenshot.",
      status: "complete",
    };

    mocks.repo.createMessage
      .mockResolvedValueOnce(baseUserMessage)
      .mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue(assistantComplete);
    mocks.repo.getMessageById.mockResolvedValue(assistantComplete);

    await sendMessageForJob({
      jobId: "job-1",
      content: "Help with this form",
      attachments: [
        {
          name: "form.png",
          mediaType: "image/png",
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
      ],
    });

    expect(mocks.repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "user",
        attachments: [
          {
            name: "form.png",
            mediaType: "image/png",
            dataUrl: "data:image/png;base64,aGVsbG8=",
          },
        ],
      }),
    );

    const userMessage = mocks.llmCallJson.mock.calls[0][0].messages.at(-1);
    expect(userMessage.role).toBe("user");
    expect(userMessage.content).toEqual([
      {
        type: "text",
        text: expect.stringContaining("Help with this form"),
      },
      {
        type: "image",
        imageUrl: "data:image/png;base64,aGVsbG8=",
        mediaType: "image/png",
        name: "form.png",
      },
    ]);
  });

  it("rejects screenshots before running when the selected model is text-only", async () => {
    mocks.resolveLlmRuntimeSettings.mockResolvedValue({
      model: "text-embedding-3-small",
      provider: "openai",
      baseUrl: null,
      apiKey: "test-key",
    });

    await expect(
      sendMessageForJob({
        jobId: "job-1",
        content: "Read this screenshot",
        attachments: [
          {
            name: "screen.png",
            mediaType: "image/png",
            dataUrl: "data:image/png;base64,aGVsbG8=",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });

    expect(mocks.llmCallJson).not.toHaveBeenCalled();
    expect(mocks.repo.createMessage).not.toHaveBeenCalled();
  });

  it("checks OpenRouter model metadata for screenshot support", async () => {
    mocks.resolveLlmRuntimeSettings.mockResolvedValue({
      model: "example/text-only",
      provider: "openrouter",
      baseUrl: "https://openrouter.ai",
      apiKey: "test-key",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "example/text-only",
              architecture: { input_modalities: ["text"] },
            },
          ],
        }),
      })),
    );

    await expect(
      sendMessageForJob({
        jobId: "job-1",
        content: "Read this screenshot",
        attachments: [
          {
            name: "screen.png",
            mediaType: "image/png",
            dataUrl: "data:image/png;base64,aGVsbG8=",
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });

    expect(global.fetch).toHaveBeenCalledWith(
      "https://openrouter.ai/api/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer test-key" },
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mocks.repo.createMessage).not.toHaveBeenCalled();
  });

  it("caches OpenRouter image capability lookups", async () => {
    mocks.resolveLlmRuntimeSettings.mockResolvedValue({
      model: "example/vision",
      provider: "openrouter",
      baseUrl: "https://openrouter.ai",
      apiKey: "test-key",
    });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "example/vision",
            architecture: { input_modalities: ["text", "image"] },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-vision",
      content: "",
      status: "partial",
    };
    mocks.repo.createMessage.mockResolvedValue(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue({
      ...assistantPartial,
      content: "ok",
      status: "complete",
    });
    mocks.repo.getMessageById.mockResolvedValue({
      ...assistantPartial,
      content: "ok",
      status: "complete",
    });

    const input = {
      jobId: "job-1",
      content: "Read this screenshot",
      attachments: [
        {
          name: "screen.png",
          mediaType: "image/png" as const,
          dataUrl: "data:image/png;base64,aGVsbG8=",
        },
      ],
    };

    await sendMessageForJob(input);
    await sendMessageForJob(input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects too many selected notes", async () => {
    await expect(
      sendMessageForJob({
        jobId: "job-1",
        content: "Use these",
        selectedNoteIds: Array.from(
          { length: 9 },
          (_, index) => `note-${index}`,
        ),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });
  });

  it("rejects too many selected emails", async () => {
    await expect(
      sendMessageForJob({
        jobId: "job-1",
        content: "Use these",
        selectedEmailIds: Array.from(
          { length: 9 },
          (_, index) => `email-${index}`,
        ),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });
  });

  it("rejects too many selected documents", async () => {
    await expect(
      sendMessageForJob({
        jobId: "job-1",
        content: "Use these",
        selectedDocumentIds: Array.from(
          { length: 6 },
          (_, index) => `doc-${index}`,
        ),
      }),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      status: 400,
    });
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

  it("regenerates any assistant message, not just the latest", async () => {
    const assistantPartial: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-regen",
      content: "",
      status: "partial",
      parentMessageId: "user-1",
    };
    const assistantComplete: JobChatMessage = {
      ...baseAssistantMessage,
      id: "assistant-regen",
      content: "Thanks for your question.",
      status: "complete",
      parentMessageId: "user-1",
    };

    mocks.repo.getMessageById
      .mockResolvedValueOnce(baseAssistantMessage) // target lookup
      .mockResolvedValueOnce(baseUserMessage) // parent user lookup
      .mockResolvedValueOnce(assistantComplete); // final lookup after run

    mocks.repo.getAncestorPath.mockResolvedValue([baseUserMessage]);
    mocks.repo.createMessage.mockResolvedValueOnce(assistantPartial);
    mocks.repo.updateMessage.mockResolvedValue(assistantComplete);

    const result = await regenerateMessage({
      jobId: "job-1",
      threadId: "thread-1",
      assistantMessageId: "assistant-1",
    });

    expect(result.runId).toBe("run-1");
    expect(result.assistantMessage?.id).toBe("assistant-regen");
    expect(mocks.repo.setActiveChild).toHaveBeenCalledWith(
      "user-1",
      "assistant-regen",
    );
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
    expect(mocks.repo.completeRunIfRunning).not.toHaveBeenCalled();
  });

  it("returns alreadyFinished when run completes before cancel write", async () => {
    mocks.repo.getRunById.mockResolvedValue({
      id: "run-race",
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
    mocks.repo.completeRunIfRunning.mockResolvedValue({
      id: "run-race",
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
      runId: "run-race",
    });

    expect(result).toEqual({ cancelled: false, alreadyFinished: true });
  });

  it("maps createRun unique constraint races to conflict", async () => {
    mocks.repo.createMessage.mockResolvedValue(baseUserMessage);
    mocks.repo.createRun.mockRejectedValue(
      new Error(
        "UNIQUE constraint failed: job_chat_runs.thread_id (idx_job_chat_runs_thread_running_unique)",
      ),
    );

    await expect(
      sendMessageForJob({
        jobId: "job-1",
        content: "hello",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      status: 409,
    });
  });
});
