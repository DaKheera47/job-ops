import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GeminiCliClient } from "./client";

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

describe("GeminiCliClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("validateCredentials succeeds when CLI returns wrapped JSON", async () => {
    const { child, stdout } = createMockChild();
    const spawnFn = vi.fn().mockReturnValue(child);

    const pending = new GeminiCliClient({ spawnFn }).validateCredentials();
    queueMicrotask(() => {
      stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            response: JSON.stringify({ ok: true }),
          }),
        ),
      );
      child.emit("close", 0);
    });

    const result = await pending;
    expect(result.valid).toBe(true);
    expect(spawnFn).toHaveBeenCalled();
    const args = spawnFn.mock.calls[0]?.[1] as string[] | undefined;
    expect(args).toContain("--skip-trust");
    expect(args).toContain("--approval-mode=plan");
    expect(args).toContain("-o=json");
  });

  it("callJson returns model text from CLI response field", async () => {
    const { child, stdout } = createMockChild();
    const spawnFn = vi.fn().mockReturnValue(child);

    const pending = new GeminiCliClient({ spawnFn }).callJson({
      model: "google/gemini-2.5-flash",
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
            response: JSON.stringify({ value: "from-cli" }),
          }),
        ),
      );
      child.emit("close", 0);
    });

    const result = await pending;
    expect(result.text).toBe(JSON.stringify({ value: "from-cli" }));
    const args = spawnFn.mock.calls[0]?.[1] as string[] | undefined;
    expect(args).toContain("-m=gemini-2.5-flash");
  });
});
