import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeCliClient } from "./client";

function createMockChild() {
  const stdin = Object.assign(new EventEmitter(), {
    end: vi.fn(),
  });
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const child = Object.assign(new EventEmitter(), {
    stdin,
    stdout,
    stderr,
    kill: vi.fn(),
  });
  return { child, stdin, stdout, stderr };
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

  it("sends image inputs through stream-json stdin", async () => {
    const { child, stdin, stdout } = createMockChild();
    const spawnFn = vi.fn().mockReturnValue(child);

    const pending = new ClaudeCliClient({ spawnFn }).callJson({
      model: "sonnet",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Review this image" },
            {
              type: "image",
              imageUrl: "data:image/png;base64,aGVsbG8=",
              mediaType: "image/png",
              name: "screenshot.png",
            },
          ],
        },
      ],
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
          [
            JSON.stringify({ type: "system", subtype: "init" }),
            JSON.stringify({
              type: "assistant",
              message: { content: [{ type: "text", text: "Working" }] },
            }),
            JSON.stringify({
              type: "result",
              subtype: "success",
              is_error: false,
              structured_output: { value: "from-image" },
            }),
          ].join("\n"),
        ),
      );
      child.emit("close", 0);
    });

    await expect(pending).resolves.toEqual({
      text: JSON.stringify({ value: "from-image" }),
    });
    const args = spawnFn.mock.calls[0]?.[1] as string[] | undefined;
    expect(args).toContain("--input-format");
    expect(args).toContain("stream-json");
    expect(args?.[args.indexOf("--output-format") + 1]).toBe("stream-json");
    expect(args).toContain("--verbose");

    const stdinInput = stdin.end.mock.calls[0]?.[0] as string | undefined;
    const payload = JSON.parse(stdinInput?.trim() || "null") as {
      message?: { content?: unknown[] };
    };
    expect(payload.message?.content).toContainEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: "aGVsbG8=",
      },
    });
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
