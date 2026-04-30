import { type ChildProcess, spawn } from "node:child_process";
import { logger } from "@infra/logger";

type ViewerStatus = { available: true } | { available: false; reason: string };

const STARTUP_DELAY_MS = 1_200;
const DEFAULT_DISPLAY = ":99";
const DEFAULT_NOVNC_PORT = "6080";
const DEFAULT_VNC_PORT = "5900";

let viewerProcesses: ChildProcess[] = [];
let startPromise: Promise<ViewerStatus> | null = null;

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

function buildNoVncCommand(novncPort: string, vncPort: string): string {
  return `
NOVNC_PATH=$(find /usr -path "*/novnc/utils/novnc_proxy" -o -path "*/novnc/utils/launch.sh" 2>/dev/null | head -1)
if [ -n "$NOVNC_PATH" ]; then
  exec "$NOVNC_PATH" --vnc "localhost:${vncPort}" --listen "${novncPort}"
fi
NOVNC_WEB=$(find /usr -type d -name novnc 2>/dev/null | head -1)
exec websockify --web "$NOVNC_WEB" "${novncPort}" "localhost:${vncPort}"
`;
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
  const novncPort = process.env.NOVNC_PORT || DEFAULT_NOVNC_PORT;
  const vncPort = process.env.VNC_PORT || DEFAULT_VNC_PORT;

  stopViewerProcesses();

  logger.info("Starting challenge viewer processes", {
    display,
    novncPort,
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
    ["-display", display, "-forever", "-nopw", "-quiet", "-rfbport", vncPort],
    "x11vnc",
  );
  startProcess("sh", ["-c", buildNoVncCommand(novncPort, vncPort)], "novnc");

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

export function buildChallengeViewerUrl(args: {
  protocol: string;
  hostname: string;
}): string {
  const configured = process.env.JOBOPS_CHALLENGE_VIEWER_URL;
  if (configured) return configured;

  const novncPort = process.env.NOVNC_PORT || DEFAULT_NOVNC_PORT;
  return `${args.protocol}//${args.hostname}:${novncPort}/vnc.html?autoconnect=true`;
}
