import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface, type Interface } from "node:readline";
import { logger } from "@infra/logger";
import type { JsonSchemaDefinition, LlmRequestOptions } from "../types";
import { truncate } from "../utils/string";

const DEFAULT_STARTUP_TIMEOUT_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_TURN_TIMEOUT_MS = 120_000;
const DEFAULT_IDLE_TIMEOUT_MS = 30_000;
const MAX_STDERR_LINES = 40;
const FALLBACK_CLIENT_VERSION = "dev";

type JsonRpcId = number | string;

type JsonRpcRequest = {
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

type JsonRpcErrorResponse = {
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcResponse = {
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcNotification = {
  method: string;
  params?: unknown;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | null;
  abortCleanup: (() => void) | null;
};

type NotificationWaiter = {
  resolve: (value: JsonRpcNotification) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout | null;
  abortCleanup: (() => void) | null;
};

type CodexAuthStatusResponse = {
  authMethod?: string | null;
  requiresOpenaiAuth?: boolean | null;
  username?: string | null;
  userName?: string | null;
  login?: string | null;
  email?: string | null;
  account?: Record<string, unknown> | null;
  user?: Record<string, unknown> | null;
};

function getPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function buildCodexErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("ENOENT")) {
    return "Codex CLI was not found in PATH. Install Codex inside the container and try again.";
  }
  return truncate(message, 500);
}

function isAbortError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === "AbortError" || error.message.includes("aborted");
}

function isSessionInfrastructureError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("app-server exited unexpectedly") ||
    message.includes("broken pipe") ||
    message.includes("epipe") ||
    message.includes("stream was destroyed")
  );
}

function toNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function getRecordString(
  record: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!record) return null;
  return toNonEmptyString(record[key]);
}

function extractCodexUsername(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const auth = raw as CodexAuthStatusResponse;

  const direct =
    toNonEmptyString(auth.username) ||
    toNonEmptyString(auth.userName) ||
    toNonEmptyString(auth.login) ||
    toNonEmptyString(auth.email);
  if (direct) return direct;

  const fromUser =
    getRecordString(auth.user ?? null, "username") ||
    getRecordString(auth.user ?? null, "userName") ||
    getRecordString(auth.user ?? null, "login") ||
    getRecordString(auth.user ?? null, "email") ||
    getRecordString(auth.user ?? null, "name");
  if (fromUser) return fromUser;

  return (
    getRecordString(auth.account ?? null, "username") ||
    getRecordString(auth.account ?? null, "userName") ||
    getRecordString(auth.account ?? null, "login") ||
    getRecordString(auth.account ?? null, "email") ||
    getRecordString(auth.account ?? null, "name")
  );
}

function readVersionFromPackage(filePath: string): string | null {
  try {
    const raw = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return toNonEmptyString(parsed.version);
  } catch {
    return null;
  }
}

let cachedClientVersion: string | null = null;

function resolveClientVersion(): string {
  if (cachedClientVersion) {
    return cachedClientVersion;
  }

  const envVersion =
    toNonEmptyString(process.env.JOBOPS_VERSION) ||
    toNonEmptyString(process.env.npm_package_version);
  if (envVersion) {
    cachedClientVersion = envVersion;
    return cachedClientVersion;
  }

  const packageVersion =
    readVersionFromPackage(
      join(process.cwd(), "orchestrator", "package.json"),
    ) || readVersionFromPackage(join(process.cwd(), "package.json"));
  if (packageVersion) {
    cachedClientVersion = packageVersion;
    return cachedClientVersion;
  }

  cachedClientVersion = FALLBACK_CLIENT_VERSION;
  return cachedClientVersion;
}

function formatPrompt(args: {
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
    "Conversation:",
    transcript,
  ].join("\n\n");
}

function extractAgentMessageText(
  turn: { items?: unknown[] } | null,
): string | null {
  const items = Array.isArray(turn?.items) ? turn.items : [];
  let fallback: string | null = null;

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (record.type !== "agentMessage") continue;

    const text = typeof record.text === "string" ? record.text.trim() : "";
    if (!text) continue;

    const phase = record.phase;
    if (phase === "final_answer") {
      return text;
    }
    fallback = text;
  }

  return fallback;
}

function pickBestAgentMessageText(
  messages: Array<{ text: string; phase: string | null }>,
): string | null {
  let finalAnswer: string | null = null;
  let fallback: string | null = null;

  for (const message of messages) {
    const text = message.text.trim();
    if (!text) continue;
    fallback = text;
    if (message.phase === "final_answer") {
      finalAnswer = text;
    }
  }

  return finalAnswer ?? fallback;
}

class CodexAppServerSession {
  private readonly proc: ChildProcessWithoutNullStreams;
  private readonly stdoutReader: Interface;
  private readonly pending = new Map<JsonRpcId, PendingRequest>();
  private readonly notificationQueue: JsonRpcNotification[] = [];
  private readonly notificationWaiters: NotificationWaiter[] = [];
  private readonly stderrLines: string[] = [];
  private closedError: Error | null = null;
  private nextId = 1;

  private constructor(proc: ChildProcessWithoutNullStreams) {
    this.proc = proc;
    this.stdoutReader = createInterface({
      input: proc.stdout,
      crlfDelay: Number.POSITIVE_INFINITY,
    });

    this.stdoutReader.on("line", (line) => {
      this.handleStdoutLine(line);
    });

    this.proc.stderr.on("data", (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        this.stderrLines.push(trimmed);
        if (this.stderrLines.length > MAX_STDERR_LINES) {
          this.stderrLines.shift();
        }
      }
    });

    this.proc.on("error", (error) => {
      this.shutdownWithError(error);
    });

    this.proc.on("exit", (code, signal) => {
      if (this.closedError) return;
      const details = [
        `code=${code ?? "null"}`,
        `signal=${signal ?? "null"}`,
        this.stderrLines.length ? `stderr=${this.stderrLines.join(" | ")}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      this.shutdownWithError(
        new Error(
          `Codex app-server exited unexpectedly${details ? ` (${details})` : ""}.`,
        ),
      );
    });
  }

  static async start(args: {
    signal?: AbortSignal;
    startupTimeoutMs?: number;
  }): Promise<CodexAppServerSession> {
    const command = process.env.CODEX_APP_SERVER_BIN?.trim() || "codex";
    const proc = spawn(command, ["app-server", "--listen", "stdio://"], {
      stdio: "pipe",
      cwd: process.cwd(),
      env: process.env,
    });
    const session = new CodexAppServerSession(proc);

    const startupTimeoutMs =
      args.startupTimeoutMs ??
      getPositiveIntEnv(
        "CODEX_APP_SERVER_STARTUP_TIMEOUT_MS",
        DEFAULT_STARTUP_TIMEOUT_MS,
      );

    try {
      await session.request(
        "initialize",
        {
          clientInfo: {
            name: "job-ops",
            title: "JobOps",
            version: resolveClientVersion(),
          },
          capabilities: {
            experimentalApi: false,
            optOutNotificationMethods: null,
          },
        },
        {
          signal: args.signal,
          timeoutMs: startupTimeoutMs,
        },
      );
      session.notify("initialized");
      return session;
    } catch (error) {
      await session.close();
      throw new Error(buildCodexErrorMessage(error));
    }
  }

  async close(): Promise<void> {
    if (this.proc.killed) return;

    this.stdoutReader.close();
    this.proc.kill("SIGTERM");

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (!this.proc.killed) {
          this.proc.kill("SIGKILL");
        }
        resolve();
      }, 1_500);

      this.proc.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  notify(method: string, params?: unknown): void {
    this.writeJson({
      method,
      ...(params === undefined ? {} : { params }),
    });
  }

  async request(
    method: string,
    params: unknown,
    options?: {
      signal?: AbortSignal;
      timeoutMs?: number;
    },
  ): Promise<unknown> {
    if (this.closedError) {
      throw this.closedError;
    }

    const id = this.nextId++;
    const timeoutMs =
      options?.timeoutMs ??
      getPositiveIntEnv(
        "CODEX_APP_SERVER_REQUEST_TIMEOUT_MS",
        DEFAULT_REQUEST_TIMEOUT_MS,
      );

    return await new Promise<unknown>((resolve, reject) => {
      const pending: PendingRequest = {
        resolve: (value) => {
          if (pending.timer) clearTimeout(pending.timer);
          if (pending.abortCleanup) pending.abortCleanup();
          resolve(value);
        },
        reject: (error) => {
          if (pending.timer) clearTimeout(pending.timer);
          if (pending.abortCleanup) pending.abortCleanup();
          reject(error);
        },
        timer: null,
        abortCleanup: null,
      };

      pending.timer = setTimeout(() => {
        this.pending.delete(id);
        pending.reject(
          new Error(`Codex app-server request timeout (${method}).`),
        );
      }, timeoutMs);

      if (options?.signal) {
        if (options.signal.aborted) {
          this.pending.delete(id);
          pending.reject(new Error(`Codex request aborted (${method}).`));
          return;
        }
        const onAbort = () => {
          this.pending.delete(id);
          pending.reject(new Error(`Codex request aborted (${method}).`));
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        pending.abortCleanup = () => {
          options.signal?.removeEventListener("abort", onAbort);
        };
      }

      this.pending.set(id, pending);
      const request: JsonRpcRequest = { id, method, params };
      this.writeJson(request);
    });
  }

  async waitForNotification(
    predicate: (notification: JsonRpcNotification) => boolean,
    options?: {
      signal?: AbortSignal;
      timeoutMs?: number;
    },
  ): Promise<JsonRpcNotification> {
    const timeoutMs =
      options?.timeoutMs ??
      getPositiveIntEnv(
        "CODEX_APP_SERVER_TURN_TIMEOUT_MS",
        DEFAULT_TURN_TIMEOUT_MS,
      );

    while (true) {
      const fromQueue = this.notificationQueue.find((notification) =>
        predicate(notification),
      );
      if (fromQueue) {
        const index = this.notificationQueue.indexOf(fromQueue);
        this.notificationQueue.splice(index, 1);
        return fromQueue;
      }

      const next = await this.waitForNextNotification({
        signal: options?.signal,
        timeoutMs,
      });

      if (predicate(next)) {
        return next;
      }

      this.notificationQueue.push(next);
    }
  }

  clearBufferedNotifications(): void {
    this.notificationQueue.length = 0;
  }

  private waitForNextNotification(options?: {
    signal?: AbortSignal;
    timeoutMs?: number;
  }): Promise<JsonRpcNotification> {
    if (this.closedError) {
      return Promise.reject(this.closedError);
    }

    return new Promise<JsonRpcNotification>((resolve, reject) => {
      const waiter: NotificationWaiter = {
        resolve: (notification) => {
          if (waiter.timer) clearTimeout(waiter.timer);
          if (waiter.abortCleanup) waiter.abortCleanup();
          resolve(notification);
        },
        reject: (error) => {
          if (waiter.timer) clearTimeout(waiter.timer);
          if (waiter.abortCleanup) waiter.abortCleanup();
          reject(error);
        },
        timer: null,
        abortCleanup: null,
      };

      const timeoutMs = options?.timeoutMs;
      if (timeoutMs && timeoutMs > 0) {
        waiter.timer = setTimeout(() => {
          this.removeWaiter(waiter);
          waiter.reject(new Error("Codex notification wait timeout."));
        }, timeoutMs);
      }

      if (options?.signal) {
        if (options.signal.aborted) {
          waiter.reject(new Error("Codex notification wait aborted."));
          return;
        }
        const onAbort = () => {
          this.removeWaiter(waiter);
          waiter.reject(new Error("Codex notification wait aborted."));
        };
        options.signal.addEventListener("abort", onAbort, { once: true });
        waiter.abortCleanup = () => {
          options.signal?.removeEventListener("abort", onAbort);
        };
      }

      this.notificationWaiters.push(waiter);
    });
  }

  private removeWaiter(target: NotificationWaiter): void {
    const index = this.notificationWaiters.indexOf(target);
    if (index >= 0) {
      this.notificationWaiters.splice(index, 1);
    }
  }

  private handleStdoutLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message: unknown;
    try {
      message = JSON.parse(trimmed) as unknown;
    } catch {
      logger.warn("Codex app-server emitted non-JSON output", {
        line: truncate(trimmed, 400),
      });
      return;
    }

    if (!message || typeof message !== "object") return;
    const record = message as Record<string, unknown>;

    if ("id" in record && "method" in record) {
      this.handleServerRequest(record);
      return;
    }

    if ("id" in record && ("result" in record || "error" in record)) {
      this.handleResponse(record as JsonRpcResponse);
      return;
    }

    if ("method" in record && typeof record.method === "string") {
      this.handleNotification({
        method: record.method,
        ...(Object.hasOwn(record, "params") ? { params: record.params } : {}),
      });
      return;
    }
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);

    if (response.error) {
      const message =
        response.error.message || "Unknown Codex app-server request error.";
      pending.reject(new Error(truncate(message, 500)));
      return;
    }
    pending.resolve(response.result);
  }

  private handleServerRequest(request: Record<string, unknown>): void {
    const id = request.id;
    if (typeof id !== "string" && typeof id !== "number") {
      return;
    }
    const method =
      typeof request.method === "string" ? request.method : "unknown-method";

    logger.warn("Codex app-server sent unsupported server request", {
      method,
    });

    const response: JsonRpcErrorResponse = {
      id,
      error: {
        code: -32601,
        message: `Unsupported server request: ${method}`,
      },
    };
    this.writeJson(response);
  }

  private handleNotification(notification: JsonRpcNotification): void {
    const waiter = this.notificationWaiters.shift();
    if (waiter) {
      waiter.resolve(notification);
      return;
    }
    this.notificationQueue.push(notification);
  }

  private writeJson(payload: unknown): void {
    if (this.closedError) {
      throw this.closedError;
    }
    this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private shutdownWithError(error: unknown): void {
    if (this.closedError) return;
    this.closedError = new Error(buildCodexErrorMessage(error));

    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      pending.reject(this.closedError);
    }

    while (this.notificationWaiters.length > 0) {
      const waiter = this.notificationWaiters.shift();
      waiter?.reject(this.closedError);
    }
  }
}

let sharedSession: CodexAppServerSession | null = null;
let startupPromise: Promise<CodexAppServerSession> | null = null;
let idleTimer: NodeJS.Timeout | null = null;
let operationTail: Promise<void> = Promise.resolve();

function clearIdleTimer(): void {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

async function resetSharedSession(): Promise<void> {
  clearIdleTimer();
  const session = sharedSession;
  sharedSession = null;
  if (session) {
    await session.close();
  }
}

function scheduleIdleClose(): void {
  clearIdleTimer();
  const idleTimeoutMs = getPositiveIntEnv(
    "CODEX_APP_SERVER_IDLE_TIMEOUT_MS",
    DEFAULT_IDLE_TIMEOUT_MS,
  );
  if (idleTimeoutMs <= 0) return;

  idleTimer = setTimeout(() => {
    void enqueueSessionOperation(async () => {
      await resetSharedSession();
    });
  }, idleTimeoutMs);
}

async function getOrStartSession(
  signal?: AbortSignal,
): Promise<CodexAppServerSession> {
  if (sharedSession) {
    return sharedSession;
  }
  if (startupPromise) {
    return await startupPromise;
  }

  startupPromise = CodexAppServerSession.start({ signal });
  try {
    const session = await startupPromise;
    sharedSession = session;
    return session;
  } finally {
    startupPromise = null;
  }
}

function enqueueSessionOperation<T>(task: () => Promise<T>): Promise<T> {
  const run = operationTail.then(task, task);
  operationTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function withCodexSession<T>(args: {
  signal?: AbortSignal;
  task: (session: CodexAppServerSession) => Promise<T>;
}): Promise<T> {
  return await enqueueSessionOperation(async () => {
    clearIdleTimer();
    const session = await getOrStartSession(args.signal);
    session.clearBufferedNotifications();
    try {
      return await args.task(session);
    } catch (error) {
      if (isSessionInfrastructureError(error)) {
        await resetSharedSession();
      }
      throw error;
    } finally {
      scheduleIdleClose();
    }
  });
}

async function closeCodexSessionForTests(): Promise<void> {
  await enqueueSessionOperation(async () => {
    await resetSharedSession();
  });
}

export class CodexClient {
  async getAuthStatus(signal?: AbortSignal): Promise<{
    valid: boolean;
    message: string | null;
    username: string | null;
  }> {
    try {
      return await withCodexSession({
        signal,
        task: async (session) => {
          const auth = (await session.request("getAuthStatus", {
            includeToken: false,
            refreshToken: false,
          })) as CodexAuthStatusResponse;

          if (!auth?.authMethod && auth?.requiresOpenaiAuth !== false) {
            return {
              valid: false,
              message:
                "Codex is not authenticated in this container. Run `codex login` and try again.",
              username: null,
            };
          }

          return {
            valid: true,
            message: null,
            username: extractCodexUsername(auth),
          };
        },
      });
    } catch (error) {
      if (isAbortError(error)) {
        return {
          valid: false,
          message: "Codex validation was cancelled.",
          username: null,
        };
      }
      return {
        valid: false,
        message: buildCodexErrorMessage(error),
        username: null,
      };
    }
  }

  async validateCredentials(signal?: AbortSignal): Promise<{
    valid: boolean;
    message: string | null;
    username?: string | null;
  }> {
    const status = await this.getAuthStatus(signal);
    return {
      valid: status.valid,
      message: status.message,
      username: status.username,
    };
  }

  async listModels(signal?: AbortSignal): Promise<string[]> {
    return await withCodexSession({
      signal,
      task: async (session) => {
        const models: string[] = [];
        let cursor: string | null = null;

        while (true) {
          const result = (await session.request("model/list", {
            cursor,
            limit: 100,
            includeHidden: false,
          })) as {
            data?: Array<{ model?: string | null; id?: string | null }>;
            nextCursor?: string | null;
          };

          for (const model of result.data ?? []) {
            const value = (model.model || model.id || "").trim();
            if (value) {
              models.push(value);
            }
          }

          if (!result.nextCursor) {
            break;
          }
          cursor = result.nextCursor;
        }

        return Array.from(new Set(models)).sort((left, right) =>
          left.localeCompare(right),
        );
      },
    });
  }

  async callJson(
    options: LlmRequestOptions<unknown>,
  ): Promise<{ text: string; turnId: string }> {
    return await withCodexSession({
      signal: options.signal,
      task: async (session) => {
        const threadStart = (await session.request("thread/start", {
          model: options.model.trim() || null,
          ephemeral: true,
          approvalPolicy: "never",
          sandbox: "read-only",
          experimentalRawEvents: false,
          persistExtendedHistory: false,
        })) as {
          thread?: { id?: string };
        };

        const threadId = threadStart.thread?.id;
        if (!threadId) {
          throw new Error("Codex thread/start did not return a thread id.");
        }

        const turnStart = (await session.request(
          "turn/start",
          {
            threadId,
            model: options.model.trim() || null,
            input: [
              {
                type: "text",
                text: formatPrompt({
                  messages: options.messages,
                  jsonSchema: options.jsonSchema,
                }),
                text_elements: [],
              },
            ],
            outputSchema: options.jsonSchema.schema,
          },
          {
            signal: options.signal,
            timeoutMs: getPositiveIntEnv(
              "CODEX_APP_SERVER_REQUEST_TIMEOUT_MS",
              DEFAULT_REQUEST_TIMEOUT_MS,
            ),
          },
        )) as {
          turn?: { id?: string };
        };

        const turnId = turnStart.turn?.id;
        if (!turnId) {
          throw new Error("Codex turn/start did not return a turn id.");
        }

        const timeoutMs = getPositiveIntEnv(
          "CODEX_APP_SERVER_TURN_TIMEOUT_MS",
          DEFAULT_TURN_TIMEOUT_MS,
        );
        const capturedMessages = new Map<
          string,
          { text: string; phase: string | null }
        >();
        let turnCompleted: JsonRpcNotification | null = null;

        while (!turnCompleted) {
          const notification = await session.waitForNotification(
            (candidate) => {
              if (candidate.method === "turn/completed") {
                const params = candidate.params as
                  | { turn?: { id?: string } }
                  | undefined;
                return params?.turn?.id === turnId;
              }

              if (candidate.method === "item/agentMessage/delta") {
                const params = candidate.params as
                  | { threadId?: string; turnId?: string; itemId?: string }
                  | undefined;
                return (
                  params?.threadId === threadId &&
                  params?.turnId === turnId &&
                  typeof params.itemId === "string"
                );
              }

              if (candidate.method === "item/completed") {
                const params = candidate.params as
                  | { threadId?: string; turnId?: string; item?: unknown }
                  | undefined;
                return (
                  params?.threadId === threadId &&
                  params?.turnId === turnId &&
                  typeof params.item === "object" &&
                  params.item !== null
                );
              }

              return false;
            },
            {
              signal: options.signal,
              timeoutMs,
            },
          );

          if (notification.method === "item/agentMessage/delta") {
            const params = notification.params as
              | { itemId?: string; delta?: string }
              | undefined;
            const itemId = params?.itemId;
            if (
              typeof itemId === "string" &&
              typeof params?.delta === "string"
            ) {
              const existing = capturedMessages.get(itemId) ?? {
                text: "",
                phase: null,
              };
              capturedMessages.set(itemId, {
                text: `${existing.text}${params.delta}`,
                phase: existing.phase,
              });
            }
            continue;
          }

          if (notification.method === "item/completed") {
            const params = notification.params as
              | { item?: unknown }
              | undefined;
            const item =
              params && typeof params.item === "object" && params.item !== null
                ? (params.item as Record<string, unknown>)
                : null;
            if (item?.type === "agentMessage") {
              const itemId =
                typeof item.id === "string"
                  ? item.id
                  : `agent-message-${capturedMessages.size + 1}`;
              const text = typeof item.text === "string" ? item.text : "";
              const phase = typeof item.phase === "string" ? item.phase : null;
              const existing = capturedMessages.get(itemId);
              capturedMessages.set(itemId, {
                text: text || existing?.text || "",
                phase: phase ?? existing?.phase ?? null,
              });
            }
            continue;
          }

          turnCompleted = notification;
        }

        const completedParams = turnCompleted.params as
          | {
              turn?: {
                id?: string;
                status?: string;
                error?: { message?: string | null } | null;
              };
            }
          | undefined;
        const status = completedParams?.turn?.status;
        if (status === "failed") {
          const errorMessage =
            completedParams?.turn?.error?.message?.trim() ||
            "Codex turn failed with no error message.";
          throw new Error(errorMessage);
        }
        if (status === "interrupted") {
          throw new Error("Codex turn was interrupted.");
        }

        const textFromEvents = pickBestAgentMessageText(
          Array.from(capturedMessages.values()),
        );
        if (textFromEvents) {
          return { text: textFromEvents, turnId };
        }

        let text: string | null = null;
        try {
          const threadRead = (await session.request("thread/read", {
            threadId,
            includeTurns: true,
          })) as {
            thread?: {
              turns?: Array<{
                id?: string;
                items?: unknown[];
              }>;
            };
          };

          const turn = (threadRead.thread?.turns ?? []).find(
            (candidate) => candidate.id === turnId,
          );
          text = extractAgentMessageText(turn ?? null);
        } catch (error) {
          logger.debug("Codex thread/read fallback unavailable", {
            message: buildCodexErrorMessage(error),
          });
        }

        if (!text) {
          throw new Error(
            "Codex turn completed but no assistant message text was returned.",
          );
        }

        return { text, turnId };
      },
    });
  }
}

export async function __resetCodexSharedSessionForTests(): Promise<void> {
  await closeCodexSessionForTests();
}
