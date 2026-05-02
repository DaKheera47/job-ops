import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { logger } from "@infra/logger";
import type { JsonSchemaDefinition, LlmRequestOptions } from "../types";
import { truncate } from "../utils/string";

const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;
const DEFAULT_VALIDATION_TIMEOUT_MS = 60_000;
const MAX_STDERR_LINES = 40;

/** Models commonly available via Gemini CLI; same `google/...` ids as the API provider. */
export const GEMINI_CLI_SUGGESTED_MODELS: string[] = [
  "google/gemini-2.5-flash",
  "google/gemini-2.5-pro",
  "google/gemini-3-flash-preview",
  "google/gemini-3-pro-preview",
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

function buildGeminiCliErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ENOENT")) {
    return "Gemini CLI was not found in PATH. Install @google/gemini-cli globally or set GEMINI_CLI_BIN.";
  }
  if (message.includes("EINVAL")) {
    return "Gemini CLI could not be started (EINVAL). Try unsetting GEMINI_CLI_BIN so `gemini` resolves via PATH, or set it to the real CLI entry (not a broken shim path).";
  }
  return truncate(message, 500);
}

/**
 * Windows npm shims (.cmd/.bat) need `shell: true` to spawn directly — but then
 * `cmd.exe` parses the full line and breaks on JSON in `-p` (quotes, `&`, `|`, etc.),
 * which surfaces as "positional prompt + -p". Prefer `node …/bundle/gemini.js` (no shell).
 */
function shouldSpawnGeminiViaWindowsShell(command: string): boolean {
  if (process.platform !== "win32") return false;
  const lower = command.trim().toLowerCase();
  return lower.endsWith(".cmd") || lower.endsWith(".bat");
}

function tryResolveGeminiBundleJsBesideNpmShim(command: string): string | null {
  const lower = command.toLowerCase();
  if (!lower.endsWith(".cmd") && !lower.endsWith(".ps1")) return null;
  if (!isAbsolute(command)) return null;
  const shimDir = dirname(command);
  const bundle = join(
    shimDir,
    "node_modules",
    "@google",
    "gemini-cli",
    "bundle",
    "gemini.js",
  );
  return existsSync(bundle) ? bundle : null;
}

function tryDefaultWindowsGlobalGeminiBundle(): string | null {
  if (process.platform !== "win32") return null;
  const appData = process.env.APPDATA?.trim();
  if (!appData) return null;
  const bundle = join(
    appData,
    "npm",
    "node_modules",
    "@google",
    "gemini-cli",
    "bundle",
    "gemini.js",
  );
  return existsSync(bundle) ? bundle : null;
}

type GeminiCliSpawnTarget = {
  command: string;
  /** When non-empty, `spawn(command, [...scriptPrefix, ...procArgs])` (Node + CLI bundle). */
  scriptPrefix: string[];
  shell: boolean;
};

function resolveGeminiCliSpawnTarget(bin: string): GeminiCliSpawnTarget {
  const trimmed = bin.trim() || "gemini";

  const envScript = process.env.GEMINI_CLI_SCRIPT?.trim();
  if (envScript && existsSync(envScript)) {
    return {
      command: process.execPath,
      scriptPrefix: [envScript],
      shell: false,
    };
  }

  const fromShim = tryResolveGeminiBundleJsBesideNpmShim(trimmed);
  if (fromShim) {
    return {
      command: process.execPath,
      scriptPrefix: [fromShim],
      shell: false,
    };
  }

  const normalized = trimmed.toLowerCase();
  if (
    process.platform === "win32" &&
    (normalized === "gemini" || normalized === "gemini.cmd")
  ) {
    const globalBundle = tryDefaultWindowsGlobalGeminiBundle();
    if (globalBundle) {
      return {
        command: process.execPath,
        scriptPrefix: [globalBundle],
        shell: false,
      };
    }
  }

  return {
    command: trimmed,
    scriptPrefix: [],
    shell: shouldSpawnGeminiViaWindowsShell(trimmed),
  };
}

function normalizeCliModelId(model: string): string {
  return model
    .trim()
    .replace(/^models\//, "")
    .replace(/^google\//, "");
}

function formatStructuredPrompt(args: {
  messages: LlmRequestOptions<unknown>["messages"];
  jsonSchema: JsonSchemaDefinition;
}): string {
  const transcript = args.messages
    .map((message, index) => {
      return `Message ${index + 1} (${message.role.toUpperCase()}):\n${message.content.trim()}`;
    })
    .join("\n\n");

  return [
    "You are generating a structured JSON response for JobOps.",
    "Do not run commands or tools. Answer directly.",
    "Return only valid JSON with no markdown fences or extra text.",
    "The response must follow this schema exactly:",
    JSON.stringify(args.jsonSchema.schema, null, 2),
    "",
    "Transcript:",
    transcript,
  ].join("\n");
}

export type GeminiCliSpawnFn = typeof spawn;

function parseCliJsonOutput(stdout: string): { response: string } {
  const trimmed = stdout.trim();
  const parsed = JSON.parse(trimmed) as { response?: unknown };
  const response = toNonEmptyString(parsed.response);
  if (!response) {
    throw new Error(
      "Gemini CLI JSON output did not include a string `response` field.",
    );
  }
  return { response };
}

async function runGeminiCliOnce(args: {
  spawnFn: GeminiCliSpawnFn;
  prompt: string;
  model: string | null;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<{ stdout: string; stderr: string }> {
  const bin = process.env.GEMINI_CLI_BIN?.trim() || "gemini";
  const trustEnv = process.env.GEMINI_CLI_TRUST_WORKSPACE?.trim();
  const trustWorkspace = trustEnv === "true" || trustEnv === "1";
  // Use `key=value` for options that take values. A bare `plan` after `--approval-mode`
  // is parsed as the default command's positional `query`, which conflicts with `-p`.
  const procArgs: string[] = [
    ...(trustWorkspace ? [] : ["--skip-trust"]),
    "--approval-mode=plan",
    "-o=json",
  ];
  const cliModel = args.model ? normalizeCliModelId(args.model) : "";
  if (cliModel) {
    procArgs.push(`-m=${cliModel}`);
  }
  procArgs.push("-p", args.prompt);

  const target = resolveGeminiCliSpawnTarget(bin);

  return await new Promise((resolve, reject) => {
    const stderrLines: string[] = [];
    const stdoutChunks: Buffer[] = [];
    let settled = false;

    const child = args.spawnFn(
      target.command,
      [...target.scriptPrefix, ...procArgs],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env },
        windowsHide: true,
        shell: target.shell,
      },
    );

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
        reject(new Error(`Gemini CLI timed out after ${args.timeoutMs}ms.`));
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
          reject(new Error("Gemini CLI invocation was aborted."));
          return;
        }
        const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
        const stderr = stderrLines.join(" | ");
        if (code !== 0) {
          reject(
            new Error(
              stderr ||
                stdout ||
                `Gemini CLI exited with code ${code ?? "unknown"}.`,
            ),
          );
          return;
        }
        resolve({ stdout, stderr });
      });
    });
  });
}

export type GeminiCliClientOptions = {
  spawnFn?: GeminiCliSpawnFn;
};

export class GeminiCliClient {
  private readonly spawnFn: GeminiCliSpawnFn;

  constructor(options: GeminiCliClientOptions = {}) {
    this.spawnFn = options.spawnFn ?? spawn;
  }

  async validateCredentials(signal?: AbortSignal): Promise<{
    valid: boolean;
    message: string | null;
    username?: string | null;
  }> {
    const timeoutMs = getPositiveIntEnv(
      "GEMINI_CLI_VALIDATION_TIMEOUT_MS",
      DEFAULT_VALIDATION_TIMEOUT_MS,
    );
    try {
      const { stdout } = await runGeminiCliOnce({
        spawnFn: this.spawnFn,
        prompt:
          'Return only valid JSON with no markdown or explanation: {"ok":true}',
        model: null,
        timeoutMs,
        signal,
      });
      try {
        parseCliJsonOutput(stdout);
      } catch {
        return {
          valid: false,
          message:
            "Gemini CLI ran but the response was not in the expected format. Check CLI output or authentication.",
          username: null,
        };
      }
      return { valid: true, message: null, username: null };
    } catch (error) {
      if (error instanceof Error && error.message.includes("aborted")) {
        return {
          valid: false,
          message: "Gemini CLI validation was cancelled.",
          username: null,
        };
      }
      const message = buildGeminiCliErrorMessage(error);
      logger.warn("Gemini CLI credential validation failed", {
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
    const preferred = "google/gemini-3-flash-preview";
    const rest = GEMINI_CLI_SUGGESTED_MODELS.filter((m) => m !== preferred);
    return Promise.resolve([preferred, ...rest]);
  }

  async callJson(
    options: LlmRequestOptions<unknown>,
  ): Promise<{ text: string }> {
    const timeoutMs = getPositiveIntEnv(
      "GEMINI_CLI_REQUEST_TIMEOUT_MS",
      DEFAULT_REQUEST_TIMEOUT_MS,
    );
    const prompt = formatStructuredPrompt({
      messages: options.messages,
      jsonSchema: options.jsonSchema,
    });
    const model = options.model?.trim() || null;
    const { stdout } = await runGeminiCliOnce({
      spawnFn: this.spawnFn,
      prompt,
      model,
      timeoutMs,
      signal: options.signal,
    });
    const { response } = parseCliJsonOutput(stdout);
    return { text: response };
  }
}
