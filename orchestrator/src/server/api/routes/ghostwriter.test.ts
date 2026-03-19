import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

const baseMsgFields = {
  threadId: "thread-1",
  jobId: "job-1",
  tokensIn: 1,
  tokensOut: null,
  version: 1,
  replacesMessageId: null,
  parentMessageId: null,
  activeChildId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

vi.mock("@server/services/ghostwriter", () => ({
  listThreads: vi.fn(async () => [
    {
      id: "thread-1",
      jobId: "job-1",
      title: "Thread",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessageAt: new Date().toISOString(),
    },
  ]),
  createThread: vi.fn(
    async (input: { jobId: string; title?: string | null }) => ({
      id: "thread-created",
      jobId: input.jobId,
      title: input.title ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastMessageAt: null,
    }),
  ),
  listMessages: vi.fn(async () => ({
    messages: [
      {
        id: "message-1",
        ...baseMsgFields,
        role: "user",
        content: "hello",
        status: "complete",
      },
    ],
    branches: [],
  })),
  listMessagesForJob: vi.fn(async () => ({
    messages: [
      {
        id: "message-1",
        ...baseMsgFields,
        role: "user",
        content: "hello",
        status: "complete",
      },
    ],
    branches: [],
  })),
  sendMessage: vi.fn(async () => ({
    userMessage: {
      id: "user-1",
      ...baseMsgFields,
      role: "user",
      content: "hello",
      status: "complete",
    },
    assistantMessage: {
      id: "assistant-1",
      ...baseMsgFields,
      role: "assistant",
      content: "hi",
      status: "complete",
      tokensOut: 1,
    },
    runId: "run-1",
  })),
  sendMessageForJob: vi.fn(async () => ({
    userMessage: {
      id: "user-1",
      ...baseMsgFields,
      role: "user",
      content: "hello",
      status: "complete",
    },
    assistantMessage: {
      id: "assistant-1",
      ...baseMsgFields,
      role: "assistant",
      content: "hi",
      status: "complete",
      tokensOut: 1,
    },
    runId: "run-1",
  })),
  cancelRun: vi.fn(async () => ({ cancelled: true, alreadyFinished: false })),
  regenerateMessage: vi.fn(async () => ({
    runId: "run-2",
    assistantMessage: {
      id: "assistant-2",
      ...baseMsgFields,
      role: "assistant",
      content: "updated",
      status: "complete",
      tokensOut: 1,
      version: 2,
      replacesMessageId: "assistant-1",
      parentMessageId: "user-1",
    },
  })),
  editMessageForJob: vi.fn(async () => ({
    userMessage: {
      id: "user-2",
      ...baseMsgFields,
      role: "user",
      content: "edited",
      status: "complete",
    },
    assistantMessage: {
      id: "assistant-3",
      ...baseMsgFields,
      role: "assistant",
      content: "reply to edit",
      status: "complete",
      tokensOut: 3,
      parentMessageId: "user-2",
    },
    runId: "run-3",
  })),
  switchBranchForJob: vi.fn(async () => ({
    messages: [
      {
        id: "message-1",
        ...baseMsgFields,
        role: "user",
        content: "hello",
        status: "complete",
      },
    ],
    branches: [],
  })),
}));

describe.sequential("Ghostwriter API", () => {
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

  it("lists messages with request id metadata and branch info", async () => {
    const res = await fetch(`${baseUrl}/api/jobs/job-1/chat/messages`, {
      headers: {
        "x-request-id": "chat-req-1",
      },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("chat-req-1");
    expect(body.ok).toBe(true);
    expect(body.data.messages.length).toBe(1);
    expect(body.data.branches).toEqual([]);
    expect(body.meta.requestId).toBe("chat-req-1");
  });

  it("sends a message in the per-job conversation", async () => {
    const messageRes = await fetch(`${baseUrl}/api/jobs/job-1/chat/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: "hello" }),
    });
    const messageBody = await messageRes.json();

    expect(messageRes.status).toBe(200);
    expect(messageBody.ok).toBe(true);
    expect(messageBody.data.runId).toBe("run-1");
    expect(messageBody.data.assistantMessage.role).toBe("assistant");
    expect(typeof messageBody.meta.requestId).toBe("string");
  });

  it("edits a user message", async () => {
    const res = await fetch(
      `${baseUrl}/api/jobs/job-1/chat/messages/user-1/edit`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "edited content" }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.runId).toBe("run-3");
    expect(body.data.userMessage.content).toBe("edited");
  });

  it("switches branch", async () => {
    const res = await fetch(
      `${baseUrl}/api/jobs/job-1/chat/messages/message-1/switch-branch`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.messages.length).toBe(1);
    expect(body.data.branches).toEqual([]);
  });
});
