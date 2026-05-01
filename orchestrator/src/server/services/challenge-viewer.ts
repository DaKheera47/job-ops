import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { IncomingMessage, Server } from "node:http";
import { connect, type Socket } from "node:net";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import type { Request, Response } from "express";

type ViewerStatus = { available: true } | { available: false; reason: string };

const STARTUP_DELAY_MS = 1_200;
const DEFAULT_DISPLAY = ":99";
const DEFAULT_NOVNC_PORT = "6080";
const DEFAULT_VNC_PORT = "5900";
const DEFAULT_LOOPBACK_HOST = "127.0.0.1";
const VIEWER_TOKEN_TTL_MS = 5 * 60 * 1000;
const CHALLENGE_VIEWER_PREFIX = "/challenge-viewer/session/";
const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

let viewerProcesses: ChildProcess[] = [];
let startPromise: Promise<ViewerStatus> | null = null;
const viewerTokens = new Map<string, number>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isProcessAlive(process: ChildProcess): boolean {
  return process.exitCode === null && !process.killed;
}

function isViewerRunning(): boolean {
  return viewerProcesses.length > 0 && viewerProcesses.every(isProcessAlive);
}

function stopViewerProcesses(): void {
  for (const process of viewerProcesses) {
    if (isProcessAlive(process)) {
      process.kill();
    }
  }
  viewerProcesses = [];
}

function startProcess(command: string, args: string[], name: string) {
  const child = spawn(command, args, {
    env: process.env,
    stdio: "ignore",
  });

  child.on("error", (error) => {
    logger.warn("Challenge viewer process failed to start", {
      process: name,
      error,
    });
  });

  child.on("exit", (code, signal) => {
    logger.info("Challenge viewer process exited", {
      process: name,
      code,
      signal,
    });
  });

  child.unref();
  viewerProcesses.push(child);
  return child;
}

function pruneExpiredViewerTokens(now = Date.now()): void {
  for (const [token, expiresAt] of viewerTokens) {
    if (expiresAt <= now) viewerTokens.delete(token);
  }
}

function validateViewerToken(token: string): boolean {
  const now = Date.now();
  pruneExpiredViewerTokens(now);
  const expiresAt = viewerTokens.get(token);
  return Boolean(expiresAt && expiresAt > now);
}

function getViewerProxyConfig() {
  return {
    novncHost: process.env.NOVNC_HOST || DEFAULT_LOOPBACK_HOST,
    novncPort: process.env.NOVNC_PORT || DEFAULT_NOVNC_PORT,
    vncHost: process.env.VNC_HOST || DEFAULT_LOOPBACK_HOST,
    vncPort: process.env.VNC_PORT || DEFAULT_VNC_PORT,
  };
}

function buildNoVncCommand(args: {
  novncHost: string;
  novncPort: string;
  vncHost: string;
  vncPort: string;
}): string {
  return `
NOVNC_LISTEN="${args.novncHost}:${args.novncPort}"
NOVNC_HTML=$(find /usr/share /usr/local/share /usr/lib -type f -name vnc.html 2>/dev/null | head -1)
if [ -z "$NOVNC_HTML" ]; then
  echo "noVNC web root not found" >&2
  exit 1
fi
NOVNC_WEB=$(dirname "$NOVNC_HTML")
exec websockify --web "$NOVNC_WEB" "$NOVNC_LISTEN" "${args.vncHost}:${args.vncPort}"
`;
}

function parseChallengeViewerPath(pathname: string): {
  token: string;
  upstreamPath: string;
} | null {
  if (!pathname.startsWith(CHALLENGE_VIEWER_PREFIX)) return null;
  const rest = pathname.slice(CHALLENGE_VIEWER_PREFIX.length);
  const slashIndex = rest.indexOf("/");
  if (slashIndex < 0) return null;

  const token = rest.slice(0, slashIndex);
  const upstreamPath = rest.slice(slashIndex) || "/";
  if (!token || !upstreamPath.startsWith("/")) return null;
  return { token, upstreamPath };
}

function getChallengeViewerProxyTarget(originalUrl: string) {
  const incomingUrl = new URL(originalUrl, "http://localhost");
  const parsed = parseChallengeViewerPath(incomingUrl.pathname);
  if (!parsed) return null;

  const { novncHost, novncPort } = getViewerProxyConfig();
  const upstreamUrl = new URL(`http://${novncHost}:${novncPort}`);
  upstreamUrl.pathname = parsed.upstreamPath;
  upstreamUrl.search = incomingUrl.search;
  return { token: parsed.token, upstreamUrl };
}

function buildProxyHeaders(req: Request): Headers {
  const headers = new Headers();
  const { novncHost, novncPort } = getViewerProxyConfig();

  for (const [key, value] of Object.entries(req.headers)) {
    if (!value || HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  headers.set("host", `${novncHost}:${novncPort}`);
  return headers;
}

function writeUpgradeRejection(
  socket: Socket,
  statusCode: number,
  message: string,
): void {
  socket.write(
    `HTTP/1.1 ${statusCode} ${message}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
  socket.destroy();
}

async function startViewer(): Promise<ViewerStatus> {
  if (process.env.JOBOPS_CHALLENGE_VIEWER === "disabled") {
    return {
      available: false,
      reason: "Challenge viewer is disabled by JOBOPS_CHALLENGE_VIEWER.",
    };
  }

  if (process.platform !== "linux") {
    return {
      available: false,
      reason:
        "Challenge viewer is only needed in Linux container environments.",
    };
  }

  const display = process.env.DISPLAY || DEFAULT_DISPLAY;
  const { novncHost, novncPort, vncHost, vncPort } = getViewerProxyConfig();

  stopViewerProcesses();

  logger.info("Starting challenge viewer processes", {
    display,
    novncHost,
    novncPort,
    vncHost,
    vncPort,
  });

  startProcess(
    "Xvfb",
    [display, "-screen", "0", "1280x720x24", "-nolisten", "tcp"],
    "xvfb",
  );
  await sleep(500);
  startProcess(
    "x11vnc",
    [
      "-display",
      display,
      "-forever",
      "-nopw",
      "-quiet",
      "-listen",
      vncHost,
      "-rfbport",
      vncPort,
    ],
    "x11vnc",
  );
  startProcess(
    "sh",
    ["-c", buildNoVncCommand({ novncHost, novncPort, vncHost, vncPort })],
    "novnc",
  );

  await sleep(STARTUP_DELAY_MS);

  if (!isViewerRunning()) {
    stopViewerProcesses();
    return {
      available: false,
      reason:
        "Challenge viewer could not start. Check Xvfb/x11vnc/noVNC installation.",
    };
  }

  process.env.DISPLAY = display;
  return { available: true };
}

export async function ensureChallengeViewer(): Promise<ViewerStatus> {
  if (isViewerRunning()) return { available: true };
  if (!startPromise) {
    startPromise = startViewer().finally(() => {
      startPromise = null;
    });
  }
  return startPromise;
}

export function createChallengeViewerSession(
  options?: { ttlMs?: number },
): { token: string } {
  pruneExpiredViewerTokens();
  const token = randomBytes(32).toString("base64url");
  const ttl = options?.ttlMs ?? VIEWER_TOKEN_TTL_MS;
  viewerTokens.set(token, Date.now() + ttl);
  return { token };
}

export function buildChallengeViewerUrl(args: { token: string }): string {
  const viewerPath = `${CHALLENGE_VIEWER_PREFIX}${args.token}/vnc.html`;
  const webSocketPath = `${CHALLENGE_VIEWER_PREFIX.slice(1)}${args.token}/websockify`;
  const params = new URLSearchParams({
    autoconnect: "true",
    path: webSocketPath,
  });
  return `${viewerPath}?${params.toString()}`;
}

export async function proxyChallengeViewerRequest(
  req: Request,
  res: Response,
): Promise<void> {
  const target = getChallengeViewerProxyTarget(req.originalUrl);
  if (!target) {
    res.status(404).type("text/plain; charset=utf-8").send("Not found");
    return;
  }
  if (!validateViewerToken(target.token)) {
    res.status(403).type("text/plain; charset=utf-8").send("Forbidden");
    return;
  }

  try {
    const upstreamResponse = await fetch(target.upstreamUrl, {
      method: req.method,
      headers: buildProxyHeaders(req),
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });

    res.status(upstreamResponse.status);
    for (const [key, value] of upstreamResponse.headers.entries()) {
      if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) continue;
      res.setHeader(key, value);
    }

    if (req.method === "HEAD" || !upstreamResponse.body) {
      res.end();
      return;
    }

    for await (const chunk of upstreamResponse.body) {
      res.write(chunk);
    }
    res.end();
  } catch (error) {
    logger.warn("Challenge viewer proxy request failed", {
      path: req.path,
      error: sanitizeUnknown(error),
    });
    res.status(502).type("text/plain; charset=utf-8").send("Upstream error");
  }
}

export function attachChallengeViewerUpgradeProxy(server: Server): void {
  server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const target = getChallengeViewerProxyTarget(req.url ?? "");
    if (!target) return;

    if (!validateViewerToken(target.token)) {
      writeUpgradeRejection(socket, 403, "Forbidden");
      return;
    }

    const { novncHost, novncPort } = getViewerProxyConfig();
    const upstreamSocket = connect(Number(novncPort), novncHost);

    upstreamSocket.on("connect", () => {
      const requestPath = `${target.upstreamUrl.pathname}${target.upstreamUrl.search}`;
      const headerLines = [
        `${req.method ?? "GET"} ${requestPath} HTTP/${req.httpVersion}`,
      ];

      for (const [key, value] of Object.entries(req.headers)) {
        if (!value) continue;
        if (key.toLowerCase() === "host") {
          headerLines.push(`host: ${novncHost}:${novncPort}`);
          continue;
        }
        const headerValue = Array.isArray(value) ? value.join(", ") : value;
        headerLines.push(`${key}: ${headerValue}`);
      }
      if (!("host" in req.headers)) {
        headerLines.push(`host: ${novncHost}:${novncPort}`);
      }

      upstreamSocket.write(`${headerLines.join("\r\n")}\r\n\r\n`);
      if (head.length > 0) upstreamSocket.write(head);
      upstreamSocket.pipe(socket);
      socket.pipe(upstreamSocket);
    });

    upstreamSocket.on("error", (error) => {
      logger.warn("Challenge viewer websocket proxy failed", {
        error: sanitizeUnknown(error),
      });
      if (!socket.destroyed) {
        writeUpgradeRejection(socket, 502, "Bad Gateway");
      }
    });

    socket.on("error", () => {
      upstreamSocket.destroy();
    });
  });
}
