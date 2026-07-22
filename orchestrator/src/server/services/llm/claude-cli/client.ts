import { spawn } from "node:child_process";
import { logger } from "@infra/logger";
import {
  getLlmMessageText,
  type JsonSchemaDefinition,
  type LlmRequestOptions,
} from "../types";
import { truncate } from "../utils/string";

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_VALIDATION_TIMEOUT_MS = 60_000;
const MAX_STDERR_LINES = 40;

const VALIDATION_SCHEMA: JsonSchemaDefinition = {
  name: "validation",
  schema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  },
};

/** Models commonly available via Claude Code CLI. */
export const CLAUDE_CLI_SUGGESTED_MODELS: string[] = [
  "claude-sonnet-5",
  "claude-opus-4-8",
  "claude-haiku-4-5-20251001",
  "claude-fable-5",
];

function getPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function buildClaudeCliErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ENOENT")) {
    return "Claude CLI was not found in PATH. Install @anthropic-ai/claude-code globally or set CLAUDE_CLI_BIN.";
  }
  if (message.includes("EINVAL")) {
    return "Claude CLI could not be started (EINVAL). Try unsetting CLAUDE_CLI_BIN so `claude` resolves via PATH, or set it to the real CLI entry (not a broken shim path).";
  }
  return truncate(message, 500);
}

/**
 * Windows npm shims (.cmd/.bat) need `shell: true` to spawn directly. Unlike
 * gemini-cli, claude-code's bundle entry point isn't a documented resolution
 * target, so this only handles the shell-shim case (no bundle.js lookup).
 */
function shouldSpawnClaudeViaWindowsShell(command: string): boolean {
  if (process.platform !== "win32") return false;
  const lower = command.trim().toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

function formatMessagesPrompt(
  messages: LlmRequestOptions<unknown>["messages"],
): string {
  const transcript = messages
    .map((message, index) => {
      return `Message ${index + 1} (${message.role.toUpperCase()}):\n${getLlmMessageText(message.content).trim()}`;
    })
    .join("\n\n");

  return [
    "You are generating a structured JSON response for JobOps.",
    "Do not use tools; answer directly using only the information in this transcript.",
    "",
    "Transcript:",
    transcript,
  ].join("\n");
}

type ClaudeCliInputBlock =
  | { type: "text"; text: string }
  | {
      type: "image";
      source: {
        type: "base64";
        media_type: "image/png" | "image/jpeg" | "image/webp";
        data: string;
      };
    };

function hasImageInput(
  messages: LlmRequestOptions<unknown>["messages"],
): boolean {
  return messages.some(
    (message) =>
      typeof message.content !== "string" &&
      message.content.some((part) => part.type === "image"),
  );
}

function formatMessagesStreamInput(
  messages: LlmRequestOptions<unknown>["messages"],
): string {
  const content: ClaudeCliInputBlock[] = [
    {
      type: "text",
      text: [
        "You are generating a structured JSON response for JobOps.",
        "Do not use tools; answer directly using only the information in this transcript.",
        "",
        "Transcript:",
      ].join("\n"),
    },
  ];

  messages.forEach((message, index) => {
    content.push({
      type: "text",
      text: `\n\nMessage ${index + 1} (${message.role.toUpperCase()}):\n`,
    });

    if (typeof message.content === "string") {
      content.push({ type: "text", text: message.content.trim() });
      return;
    }

    for (const part of message.content) {
      if (part.type === "text") {
        content.push({ type: "text", text: part.text });
        continue;
      }

      const match = /^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s.exec(
        part.imageUrl,
      );
      if (!match) {
        throw new Error(
          "Claude CLI image input must be a PNG, JPEG, or WebP base64 data URL.",
        );
      }
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: match[1] as "image/png" | "image/jpeg" | "image/webp",
          data: match[2],
        },
      });
    }
  });

  return `${JSON.stringify({
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
  })}\n`;
}

export type ClaudeCliSpawnFn = typeof spawn;

type ClaudeCliResultEnvelope = {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
};

function parseCliJsonOutput(stdout: string): { response: string } {
  const trimmed = stdout.trim();
  let parsed: ClaudeCliResultEnvelope | undefined;
  try {
    parsed = JSON.parse(trimmed) as ClaudeCliResultEnvelope;
  } catch {
    const lines = trimmed.split(/\r?\n/);
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const candidate = JSON.parse(lines[index]) as ClaudeCliResultEnvelope;
      if (candidate.type === "result") {
        parsed = candidate;
        break;
      }
    }
  }
  if (!parsed) {
    throw new Error("Claude CLI stream output did not include a result event.");
  }
  if (parsed.is_error) {
    throw new Error(
      toNonEmptyString(parsed.result) ||
        `Claude CLI reported an error (subtype: ${parsed.subtype ?? "unknown"}).`,
    );
  }
  if (parsed.structured_output !== undefined) {
    return { response: JSON.stringify(parsed.structured_output) };
  }
  const response = toNonEmptyString(parsed.result);
  if (!response) {
    throw new Error(
      "Claude CLI JSON output did not include a `result` or `structured_output` field.",
    );
  }
  return { response };
}

async function runClaudeCliOnce(args: {
  spawnFn: ClaudeCliSpawnFn;
  input: string;
  inputFormat: "text" | "stream-json";
  model: string | null;
  jsonSchema: JsonSchemaDefinition;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  const bin = process.env.CLAUDE_CLI_BIN?.trim() || "claude";
  const procArgs: string[] = ["-p"];
  if (args.inputFormat === "stream-json") {
    procArgs.push(
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--verbose",
    );
  } else {
    procArgs.push(args.input, "--output-format", "json");
  }
  procArgs.push("--permission-mode", "plan");
  const cliModel = args.model?.trim();
  if (cliModel) {
    procArgs.push("--model", cliModel);
  }
  procArgs.push("--json-schema", JSON.stringify(args.jsonSchema.schema));

  const shell = shouldSpawnClaudeViaWindowsShell(bin);

  return await new Promise((resolve, reject) => {
    const stderrLines: string[] = [];
    const stdoutChunks: Buffer[] = [];
    let settled = false;

    const child = args.spawnFn(bin, procArgs, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
      windowsHide: true,
      shell,
    });

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const onAbort = () => {
      child.kill("SIGTERM");
    };
    if (args.signal) {
      if (args.signal.aborted) {
        onAbort();
      } else {
        args.signal.addEventListener("abort", onAbort, { once: true });
      }
    }

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdoutChunks.push(
        typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk,
      );
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t) continue;
        stderrLines.push(t);
        if (stderrLines.length > MAX_STDERR_LINES) {
          stderrLines.shift();
        }
      }
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(() => {
        reject(new Error(`Claude CLI timed out after ${args.timeoutMs}ms.`));
      });
    }, args.timeoutMs);

    child.on("error", (error) => {
      clearTimeout(timer);
      finish(() => {
        reject(error);
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      finish(() => {
        if (args.signal?.aborted) {
          reject(new Error("Claude CLI invocation was aborted."));
          return;
        }
        const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
        const stderr = stderrLines.join(" | ");
        if (code !== 0) {
          reject(
            new Error(
              stderr ||
                stdout ||
                `Claude CLI exited with code ${code ?? "unknown"}.`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      });
    });

    child.stdin.on("error", (error) => {
      clearTimeout(timer);
      finish(() => reject(error));
    });
    child.stdin.end(
      args.inputFormat === "stream-json" ? args.input : undefined,
    );
  });
}

export type ClaudeCliClientOptions = {
  spawnFn?: ClaudeCliSpawnFn;
};

export class ClaudeCliClient {
  private readonly spawnFn: ClaudeCliSpawnFn;

  constructor(options: ClaudeCliClientOptions = {}) {
    this.spawnFn = options.spawnFn ?? spawn;
  }

  async validateCredentials(signal?: AbortSignal): Promise<{
    valid: boolean;
    message: string | null;
    username?: string | null;
  }> {
    const timeoutMs = getPositiveIntEnv(
      "CLAUDE_CLI_VALIDATION_TIMEOUT_MS",
      DEFAULT_VALIDATION_TIMEOUT_MS,
    );
    try {
      const { stdout } = await runClaudeCliOnce({
        spawnFn: this.spawnFn,
        input: "Return the structured output exactly as instructed.",
        inputFormat: "text",
        model: null,
        jsonSchema: VALIDATION_SCHEMA,
        timeoutMs,
        signal,
      });
      try {
        parseCliJsonOutput(stdout);
      } catch {
        return {
          valid: false,
          message:
            "Claude CLI ran but the response was not in the expected format. Check CLI output or authentication.",
          username: null,
        };
      }
      return { valid: true, message: null, username: null };
    } catch (error) {
      if (error instanceof Error && error.message.includes("aborted")) {
        return {
          valid: false,
          message: "Claude CLI validation was cancelled.",
          username: null,
        };
      }
      const message = buildClaudeCliErrorMessage(error);
      logger.warn("Claude CLI credential validation failed", {
        message: truncate(message, 200),
      });
      return {
        valid: false,
        message,
        username: null,
      };
    }
  }

  listModels(): Promise<string[]> {
    const preferred = "claude-sonnet-5";
    const rest = CLAUDE_CLI_SUGGESTED_MODELS.filter((m) => m !== preferred);
    return Promise.resolve([preferred, ...rest]);
  }

  async callJson(
    options: LlmRequestOptions<unknown>,
  ): Promise<{ text: string }> {
    const timeoutMs = getPositiveIntEnv(
      "CLAUDE_CLI_REQUEST_TIMEOUT_MS",
      DEFAULT_REQUEST_TIMEOUT_MS,
    );
    const useStreamInput = hasImageInput(options.messages);
    const input = useStreamInput
      ? formatMessagesStreamInput(options.messages)
      : formatMessagesPrompt(options.messages);
    const model = options.model?.trim() || null;
    const { stdout } = await runClaudeCliOnce({
      spawnFn: this.spawnFn,
      input,
      inputFormat: useStreamInput ? "stream-json" : "text",
      model,
      jsonSchema: options.jsonSchema,
      timeoutMs,
      signal: options.signal,
    });
    const { response } = parseCliJsonOutput(stdout);
    return { text: response };
  }
}
