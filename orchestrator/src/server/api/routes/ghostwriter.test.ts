import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

vi.mock("../../services/ghostwriter", () => ({
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
  listMessages: vi.fn(async () => [
    {
      id: "message-1",
      threadId: "thread-1",
      jobId: "job-1",
      role: "user",
      content: "hello",
      status: "complete",
      tokensIn: 1,
      tokensOut: null,
      version: 1,
      replacesMessageId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]),
  listMessagesForJob: vi.fn(async () => [
    {
      id: "message-1",
      threadId: "thread-1",
      jobId: "job-1",
      role: "user",
      content: "hello",
      status: "complete",
      tokensIn: 1,
      tokensOut: null,
      version: 1,
      replacesMessageId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]),
  sendMessage: vi.fn(async () => ({
    userMessage: {
      id: "user-1",
      threadId: "thread-1",
      jobId: "job-1",
      role: "user",
      content: "hello",
      status: "complete",
      tokensIn: 1,
      tokensOut: null,
      version: 1,
      replacesMessageId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    assistantMessage: {
      id: "assistant-1",
      threadId: "thread-1",
      jobId: "job-1",
      role: "assistant",
      content: "hi",
      status: "complete",
      tokensIn: 1,
      tokensOut: 1,
      version: 1,
      replacesMessageId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    runId: "run-1",
  })),
  sendMessageForJob: vi.fn(async () => ({
    userMessage: {
      id: "user-1",
      threadId: "thread-1",
      jobId: "job-1",
      role: "user",
      content: "hello",
      status: "complete",
      tokensIn: 1,
      tokensOut: null,
      version: 1,
      replacesMessageId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    assistantMessage: {
      id: "assistant-1",
      threadId: "thread-1",
      jobId: "job-1",
      role: "assistant",
      content: "hi",
      status: "complete",
      tokensIn: 1,
      tokensOut: 1,
      version: 1,
      replacesMessageId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    runId: "run-1",
  })),
  cancelRun: vi.fn(async () => ({ cancelled: true, alreadyFinished: false })),
  regenerateMessage: vi.fn(async () => ({
    runId: "run-2",
    assistantMessage: {
      id: "assistant-2",
      threadId: "thread-1",
      jobId: "job-1",
      role: "assistant",
      content: "updated",
      status: "complete",
      tokensIn: 1,
      tokensOut: 1,
      version: 2,
      replacesMessageId: "assistant-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
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

  it("lists messages with request id metadata", async () => {
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
});
