import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LlmRequestOptions } from "../types";
import { __resetCodexSharedSessionForTests, CodexClient } from "./client";

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
  default: {
    spawn: spawnMock,
  },
}));

type JsonRpcRequest = {
  id: number | string;
  method: string;
  params?: unknown;
};

function mockSpawn(
  onRequest: (
    request: JsonRpcRequest,
    helpers: {
      respond: (result: unknown) => void;
      reject: (message: string, code?: number) => void;
      notify: (method: string, params: unknown) => void;
    },
  ) => void,
): void {
  vi.mocked(spawn).mockImplementation(() => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();

    const proc = new EventEmitter() as ChildProcessWithoutNullStreams & {
      killed: boolean;
    };
    proc.stdin = stdin;
    proc.stdout = stdout;
    proc.stderr = stderr;
    proc.killed = false;
    proc.kill = vi.fn((signal?: NodeJS.Signals) => {
      proc.killed = true;
      setImmediate(() => {
        proc.emit("exit", 0, signal ?? null);
      });
      return true;
    });

    const reader = createInterface({
      input: stdin,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    reader.on("line", (line) => {
      const message = JSON.parse(line) as Partial<JsonRpcRequest>;
      if (
        typeof message.method !== "string" ||
        (typeof message.id !== "string" && typeof message.id !== "number")
      ) {
        return;
      }

      const request = message as JsonRpcRequest;
      const respond = (result: unknown) => {
        stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
      };
      const reject = (message: string, code = -32000) => {
        stdout.write(
          `${JSON.stringify({
            id: request.id,
            error: { code, message },
          })}\n`,
        );
      };
      const notify = (method: string, params: unknown) => {
        stdout.write(`${JSON.stringify({ method, params })}\n`);
      };

      onRequest(request, { respond, reject, notify });
    });

    return proc;
  });
}

describe("CodexClient", () => {
  afterEach(async () => {
    await __resetCodexSharedSessionForTests();
    vi.restoreAllMocks();
  });

  it("creates an ephemeral thread, waits for completion, and returns assistant text", async () => {
    let threadReadCalls = 0;

    mockSpawn((request, helpers) => {
      if (request.method === "initialize") {
        helpers.respond({
          userAgent: "test",
          codexHome: "/tmp/codex",
          platformFamily: "unix",
          platformOs: "linux",
        });
        return;
      }
      if (request.method === "thread/start") {
        helpers.respond({
          thread: { id: "thread-1" },
        });
        return;
      }
      if (request.method === "turn/start") {
        helpers.respond({
          turn: { id: "turn-1" },
        });
        helpers.notify("item/completed", {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            type: "agentMessage",
            id: "msg-1",
            phase: "final_answer",
            text: '{"score":99,"reason":"Strong fit"}',
          },
        });
        helpers.notify("turn/completed", {
          threadId: "thread-1",
          turn: {
            id: "turn-1",
            status: "completed",
            error: null,
            items: [],
            startedAt: null,
            completedAt: null,
            durationMs: null,
          },
        });
        return;
      }
      if (request.method === "thread/read") {
        threadReadCalls += 1;
        helpers.reject("ephemeral threads do not support includeTurns", -32600);
        return;
      }

      helpers.respond({});
    });

    const client = new CodexClient();
    const response = await client.callJson({
      model: "",
      messages: [{ role: "user", content: "Score this job." }],
      jsonSchema: {
        name: "score_result",
        schema: {
          type: "object",
          properties: {
            score: { type: "number" },
            reason: { type: "string" },
          },
          required: ["score", "reason"],
          additionalProperties: false,
        },
      },
    } as LlmRequestOptions<unknown>);

    expect(response.text).toContain('"score":99');
    expect(response.turnId).toBe("turn-1");
    expect(threadReadCalls).toBe(0);
  });

  it("reports missing auth as an invalid credential state", async () => {
    mockSpawn((request, helpers) => {
      if (request.method === "initialize") {
        helpers.respond({
          userAgent: "test",
          codexHome: "/tmp/codex",
          platformFamily: "unix",
          platformOs: "linux",
        });
        return;
      }
      if (request.method === "getAuthStatus") {
        helpers.respond({
          authMethod: null,
          requiresOpenaiAuth: true,
        });
        return;
      }
      helpers.respond({});
    });

    const client = new CodexClient();
    const result = await client.validateCredentials();
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/codex login/i);
  });

  it("returns username when codex auth status includes identity data", async () => {
    mockSpawn((request, helpers) => {
      if (request.method === "initialize") {
        helpers.respond({
          userAgent: "test",
          codexHome: "/tmp/codex",
          platformFamily: "unix",
          platformOs: "linux",
        });
        return;
      }
      if (request.method === "getAuthStatus") {
        helpers.respond({
          authMethod: "openai",
          requiresOpenaiAuth: false,
          user: {
            email: "dev@example.com",
          },
        });
        return;
      }
      helpers.respond({});
    });

    const client = new CodexClient();
    const result = await client.validateCredentials();
    expect(result.valid).toBe(true);
    expect(result.username).toBe("dev@example.com");
  });

  it("paginates model/list and deduplicates model names", async () => {
    let modelListCalls = 0;

    mockSpawn((request, helpers) => {
      if (request.method === "initialize") {
        helpers.respond({
          userAgent: "test",
          codexHome: "/tmp/codex",
          platformFamily: "unix",
          platformOs: "linux",
        });
        return;
      }
      if (request.method === "model/list") {
        modelListCalls += 1;
        if (modelListCalls === 1) {
          helpers.respond({
            data: [{ model: "gpt-5" }, { id: "gpt-5-mini" }],
            nextCursor: "page-2",
          });
          return;
        }

        helpers.respond({
          data: [{ model: "gpt-5" }, { model: "o4-mini" }],
          nextCursor: null,
        });
        return;
      }
      helpers.respond({});
    });

    const client = new CodexClient();
    const models = await client.listModels();
    expect(models).toEqual(["gpt-5", "gpt-5-mini", "o4-mini"]);
  });

  it("reuses a shared app-server session across sequential calls", async () => {
    const spawnCallsBefore = vi.mocked(spawn).mock.calls.length;
    let initializeCalls = 0;
    let authCalls = 0;
    let modelListCalls = 0;

    mockSpawn((request, helpers) => {
      if (request.method === "initialize") {
        initializeCalls += 1;
        helpers.respond({
          userAgent: "test",
          codexHome: "/tmp/codex",
          platformFamily: "unix",
          platformOs: "linux",
        });
        return;
      }
      if (request.method === "getAuthStatus") {
        authCalls += 1;
        helpers.respond({
          authMethod: "openai",
          requiresOpenaiAuth: false,
        });
        return;
      }
      if (request.method === "model/list") {
        modelListCalls += 1;
        helpers.respond({
          data: [{ model: "gpt-5" }],
          nextCursor: null,
        });
        return;
      }
      helpers.respond({});
    });

    const client = new CodexClient();
    const auth = await client.validateCredentials();
    const models = await client.listModels();

    expect(auth.valid).toBe(true);
    expect(models).toEqual(["gpt-5"]);
    expect(initializeCalls).toBe(1);
    expect(authCalls).toBe(1);
    expect(modelListCalls).toBe(1);
    expect(vi.mocked(spawn).mock.calls.length - spawnCallsBefore).toBe(1);
  });
});
