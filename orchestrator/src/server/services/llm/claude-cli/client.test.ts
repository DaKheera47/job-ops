import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeCliClient } from "./client";

function createMockChild() {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = Object.assign(new EventEmitter(), {
    stdout,
    stderr,
    kill: vi.fn(),
  });
  return { child, stdout, stderr };
}

describe("ClaudeCliClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validateCredentials succeeds when CLI returns structured_output", async () => {
    const { child, stdout } = createMockChild();
    const spawnFn = vi.fn().mockReturnValue(child);

    const pending = new ClaudeCliClient({ spawnFn }).validateCredentials();
    queueMicrotask(() => {
      stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: JSON.stringify({ ok: true }),
            structured_output: { ok: true },
          }),
        ),
      );
      child.emit("close", 0);
    });

    const result = await pending;
    expect(result.valid).toBe(true);
    expect(spawnFn).toHaveBeenCalled();
    const args = spawnFn.mock.calls[0]?.[1] as string[] | undefined;
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--permission-mode");
    expect(args).toContain("plan");
  });

  it("validateCredentials fails when CLI reports is_error", async () => {
    const { child, stdout } = createMockChild();
    const spawnFn = vi.fn().mockReturnValue(child);

    const pending = new ClaudeCliClient({ spawnFn }).validateCredentials();
    queueMicrotask(() => {
      stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            type: "result",
            subtype: "error_auth",
            is_error: true,
            result: "Not authenticated.",
          }),
        ),
      );
      child.emit("close", 0);
    });

    const result = await pending;
    expect(result.valid).toBe(false);
  });

  it("callJson returns model text from structured_output field", async () => {
    const { child, stdout } = createMockChild();
    const spawnFn = vi.fn().mockReturnValue(child);

    const pending = new ClaudeCliClient({ spawnFn }).callJson({
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "Hi" }],
      jsonSchema: {
        name: "t",
        schema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
      },
    });
    queueMicrotask(() => {
      stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: JSON.stringify({ value: "from-cli" }),
            structured_output: { value: "from-cli" },
          }),
        ),
      );
      child.emit("close", 0);
    });

    const result = await pending;
    expect(result.text).toBe(JSON.stringify({ value: "from-cli" }));
    const args = spawnFn.mock.calls[0]?.[1] as string[] | undefined;
    expect(args).toContain("--model");
    expect(args).toContain("claude-sonnet-5");
    expect(args).toContain("--json-schema");
  });

  it("callJson falls back to parsing result when structured_output is absent", async () => {
    const { child, stdout } = createMockChild();
    const spawnFn = vi.fn().mockReturnValue(child);

    const pending = new ClaudeCliClient({ spawnFn }).callJson({
      model: "claude-sonnet-5",
      messages: [{ role: "user", content: "Hi" }],
      jsonSchema: {
        name: "t",
        schema: {
          type: "object",
          properties: { value: { type: "string" } },
          required: ["value"],
          additionalProperties: false,
        },
      },
    });
    queueMicrotask(() => {
      stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            type: "result",
            subtype: "success",
            is_error: false,
            result: JSON.stringify({ value: "from-result" }),
          }),
        ),
      );
      child.emit("close", 0);
    });

    const result = await pending;
    expect(result.text).toBe(JSON.stringify({ value: "from-result" }));
  });
});
