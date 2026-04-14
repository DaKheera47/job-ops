import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { logger } from "@infra/logger";
import { truncate } from "../utils/string";

const DEVICE_AUTH_TIMEOUT_MS = 15_000;
const LOGOUT_TIMEOUT_MS = 10_000;
const MAX_BUFFERED_LINES = 80;
const DEVICE_CODE_REGEX = /\b[A-Z0-9]{4,}-[A-Z0-9]{4,}\b/;
const URL_REGEX = /(https?:\/\/[^\s]+)/i;
const EXPIRES_MINUTES_REGEX = /expires in (\d+) minutes/i;

type DeviceAuthFlowStatus =
  | "idle"
  | "starting"
  | "running"
  | "completed"
  | "failed";

type DeviceAuthSession = {
  status: DeviceAuthFlowStatus;
  startedAtMs: number;
  verificationUrl: string | null;
  userCode: string | null;
  expiresAtMs: number | null;
  message: string | null;
  output: string[];
  proc: ChildProcessWithoutNullStreams | null;
};

export type CodexDeviceAuthSnapshot = {
  status: DeviceAuthFlowStatus;
  loginInProgress: boolean;
  verificationUrl: string | null;
  userCode: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  message: string | null;
};

let activeSession: DeviceAuthSession | null = null;

function stripAnsi(value: string): string {
  if (!value.includes("\u001B")) {
    return value;
  }

  let output = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "\u001B") {
      output += char;
      continue;
    }

    if (value[index + 1] !== "[") {
      continue;
    }

    index += 2;
    while (index < value.length) {
      const code = value.charCodeAt(index);
      if (code >= 0x40 && code <= 0x7e) {
        break;
      }
      index += 1;
    }
  }

  return output;
}

function toSnapshot(
  session: DeviceAuthSession | null,
): CodexDeviceAuthSnapshot {
  if (!session) {
    return {
      status: "idle",
      loginInProgress: false,
      verificationUrl: null,
      userCode: null,
      startedAt: null,
      expiresAt: null,
      message: null,
    };
  }

  return {
    status: session.status,
    loginInProgress:
      session.status === "starting" || session.status === "running",
    verificationUrl: session.verificationUrl,
    userCode: session.userCode,
    startedAt: new Date(session.startedAtMs).toISOString(),
    expiresAt: session.expiresAtMs
      ? new Date(session.expiresAtMs).toISOString()
      : null,
    message: session.message,
  };
}

function appendLine(session: DeviceAuthSession, line: string): void {
  const normalized = stripAnsi(line).trim();
  if (!normalized) return;
  session.output.push(normalized);
  if (session.output.length > MAX_BUFFERED_LINES) {
    session.output.shift();
  }

  if (!session.verificationUrl) {
    const urlMatch = normalized.match(URL_REGEX);
    if (urlMatch?.[1]) {
      session.verificationUrl = urlMatch[1];
    }
  }

  if (!session.userCode) {
    const codeMatch = normalized.match(DEVICE_CODE_REGEX);
    if (codeMatch?.[0]) {
      session.userCode = codeMatch[0];
    }
  }

  if (!session.expiresAtMs) {
    const expiresMatch = normalized.match(EXPIRES_MINUTES_REGEX);
    const minutes = expiresMatch?.[1]
      ? Number.parseInt(expiresMatch[1], 10)
      : 0;
    if (Number.isFinite(minutes) && minutes > 0) {
      session.expiresAtMs = Date.now() + minutes * 60_000;
    }
  }
}

function buildOutputMessage(session: DeviceAuthSession): string | null {
  const latest = session.output.at(-1);
  return latest ? truncate(latest, 400) : null;
}

function normalizeStartupFailureMessage(message: string): string {
  if (/enable device code authorization/i.test(message)) {
    return truncate(
      "Device-code auth is disabled for this account. Enable it in ChatGPT Security Settings, then try Codex sign-in again.",
      400,
    );
  }
  return truncate(message, 400);
}

function isAlreadyLoggedOutMessage(message: string): boolean {
  return /not logged in|not authenticated|already logged out|already signed out/i.test(
    message,
  );
}

function stopSessionProcess(session: DeviceAuthSession): void {
  if (session.proc && !session.proc.killed) {
    session.proc.kill("SIGTERM");
  }
  session.proc = null;
}

async function waitForDeviceCode(
  session: DeviceAuthSession,
): Promise<CodexDeviceAuthSnapshot> {
  return await new Promise<CodexDeviceAuthSnapshot>((resolve, reject) => {
    const proc = session.proc;
    if (!proc) {
      reject(new Error("Codex login process failed to start."));
      return;
    }

    const timeout = setTimeout(() => {
      session.status = "failed";
      session.message =
        "Timed out waiting for Codex device authorization code. Try again.";
      stopSessionProcess(session);
      cleanup();
      reject(new Error(session.message));
    }, DEVICE_AUTH_TIMEOUT_MS);

    const cleanup = () => {
      proc.stdout.off("data", onStdout);
      proc.stderr.off("data", onStderr);
      proc.off("exit", onExit);
      proc.off("error", onError);
    };

    const tryResolve = () => {
      if (session.verificationUrl && session.userCode) {
        attachExitTracking(session);
        clearTimeout(timeout);
        session.status = "running";
        session.message =
          "Open the verification URL and enter the one-time code to finish login.";
        cleanup();
        resolve(toSnapshot(session));
      }
    };

    const onStdout = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        appendLine(session, line);
      }
      tryResolve();
    };

    const onStderr = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        appendLine(session, line);
      }
      tryResolve();
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      clearTimeout(timeout);
      if (session.verificationUrl && session.userCode) {
        if (code === 0) {
          session.status = "completed";
          session.message = "Codex login completed.";
          stopSessionProcess(session);
          cleanup();
          resolve(toSnapshot(session));
          return;
        }

        session.status = "failed";
        const rawMessage =
          buildOutputMessage(session) ||
          `Codex login failed (code=${code ?? "null"}, signal=${signal ?? "null"}).`;
        session.message = normalizeStartupFailureMessage(rawMessage);
        stopSessionProcess(session);
        cleanup();
        reject(new Error(session.message));
        return;
      }

      session.status = "failed";
      const rawMessage =
        buildOutputMessage(session) ||
        `Codex login exited before a device code was returned (code=${code ?? "null"}, signal=${signal ?? "null"}).`;
      session.message = normalizeStartupFailureMessage(rawMessage);
      stopSessionProcess(session);
      cleanup();
      reject(new Error(session.message));
    };

    const onError = (error: Error) => {
      clearTimeout(timeout);
      session.status = "failed";
      const message = error.message.includes("ENOENT")
        ? "Codex CLI is not installed in this runtime."
        : normalizeStartupFailureMessage(error.message);
      session.message = normalizeStartupFailureMessage(message);
      stopSessionProcess(session);
      cleanup();
      reject(new Error(session.message));
    };

    proc.stdout.on("data", onStdout);
    proc.stderr.on("data", onStderr);
    proc.once("exit", onExit);
    proc.once("error", onError);
  });
}

function attachExitTracking(session: DeviceAuthSession): void {
  const proc = session.proc;
  if (!proc) return;

  proc.once("exit", (code, signal) => {
    const running =
      session.status === "running" || session.status === "starting";
    if (!running) return;

    if (code === 0) {
      session.status = "completed";
      session.message = "Codex login completed.";
    } else {
      session.status = "failed";
      session.message =
        buildOutputMessage(session) ||
        `Codex login failed (code=${code ?? "null"}, signal=${signal ?? "null"}).`;
    }
    stopSessionProcess(session);
  });

  proc.once("error", (error) => {
    const running =
      session.status === "running" || session.status === "starting";
    if (!running) return;

    session.status = "failed";
    session.message = truncate(error.message, 400);
    stopSessionProcess(session);
  });
}

export function getCodexDeviceAuthSnapshot(): CodexDeviceAuthSnapshot {
  return toSnapshot(activeSession);
}

export async function startCodexDeviceAuth(
  forceRestart = false,
): Promise<CodexDeviceAuthSnapshot> {
  if (activeSession) {
    if (
      activeSession.status === "starting" ||
      activeSession.status === "running"
    ) {
      if (!forceRestart) {
        return toSnapshot(activeSession);
      }
      stopSessionProcess(activeSession);
      activeSession = null;
    }
  }

  const command = process.env.CODEX_APP_SERVER_BIN?.trim() || "codex";
  const proc = spawn(command, ["login", "--device-auth"], {
    stdio: "pipe",
    cwd: process.cwd(),
    env: process.env,
  });

  const session: DeviceAuthSession = {
    status: "starting",
    startedAtMs: Date.now(),
    verificationUrl: null,
    userCode: null,
    expiresAtMs: null,
    message: null,
    output: [],
    proc,
  };

  activeSession = session;

  try {
    const snapshot = await waitForDeviceCode(session);
    return snapshot;
  } catch (error) {
    logger.warn("Codex device-auth startup failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function disconnectCodexAuth(): Promise<CodexDeviceAuthSnapshot> {
  if (activeSession) {
    stopSessionProcess(activeSession);
    activeSession = null;
  }

  const command = process.env.CODEX_APP_SERVER_BIN?.trim() || "codex";

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(command, ["logout"], {
      stdio: "pipe",
      cwd: process.cwd(),
      env: process.env,
    });

    const output: string[] = [];
    const appendOutput = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        const normalized = stripAnsi(line).trim();
        if (!normalized) continue;
        output.push(normalized);
        if (output.length > MAX_BUFFERED_LINES) {
          output.shift();
        }
      }
    };

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      reject(new Error("Timed out while disconnecting Codex."));
    }, LOGOUT_TIMEOUT_MS);

    proc.stdout.on("data", appendOutput);
    proc.stderr.on("data", appendOutput);

    proc.once("error", (error) => {
      clearTimeout(timer);
      if (error.message.includes("ENOENT")) {
        reject(new Error("Codex CLI is not installed in this runtime."));
        return;
      }
      reject(new Error(truncate(error.message, 400)));
    });

    proc.once("exit", (code, signal) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }

      const latestOutput = output.at(-1);
      const message =
        latestOutput ||
        `Codex logout failed (code=${code ?? "null"}, signal=${signal ?? "null"}).`;
      if (isAlreadyLoggedOutMessage(message)) {
        resolve();
        return;
      }
      reject(new Error(truncate(message, 400)));
    });
  });

  return toSnapshot(activeSession);
}

export function __resetCodexDeviceAuthForTests(): void {
  if (activeSession) {
    stopSessionProcess(activeSession);
  }
  activeSession = null;
}
