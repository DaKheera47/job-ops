import type { Response } from "express";

interface SetupSseOptions {
  cacheControl?: string;
  disableBuffering?: boolean;
  flushHeaders?: boolean;
}

const DEFAULT_HEARTBEAT_MS = 30_000;

export function setupSse(res: Response, options: SetupSseOptions = {}): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", options.cacheControl ?? "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (options.disableBuffering) {
    res.setHeader("X-Accel-Buffering", "no");
  }

  if (options.flushHeaders) {
    res.flushHeaders?.();
  }
}

export function writeSseData(res: Response, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

export function writeSseComment(res: Response, comment: string): void {
  res.write(`: ${comment}\n\n`);
}

export function startSseHeartbeat(
  res: Response,
  intervalMs = DEFAULT_HEARTBEAT_MS,
): () => void {
  const heartbeat = setInterval(() => {
    writeSseComment(res, "heartbeat");
  }, intervalMs);

  return () => {
    clearInterval(heartbeat);
  };
}
