import {
  getCachedAuthHeader,
  recoverAuthHeaderAfterUnauthorized,
} from "@client/api/client";

interface EventSourceSubscriptionHandlers<T> {
  onOpen?: () => void;
  onMessage: (payload: T) => void;
  onError?: () => void;
}

const FRAME_DELIMITER = /\r?\n\r?\n/;

function parseSseFrame(frame: string): string | null {
  const dataLines: string[] = [];
  for (const line of frame.split(/\r?\n/)) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }
  return dataLines.length > 0 ? dataLines.join("\n") : null;
}

function emitParsedFrame<T>(
  frame: string,
  handlers: EventSourceSubscriptionHandlers<T>,
): void {
  const data = parseSseFrame(frame);
  if (!data) return;

  try {
    handlers.onMessage(JSON.parse(data) as T);
  } catch {
    // Ignore malformed events to keep stream resilient.
  }
}

function readNextFrame(buffer: string): {
  frame: string;
  remainder: string;
} | null {
  const match = FRAME_DELIMITER.exec(buffer);
  if (!match || typeof match.index !== "number") return null;

  const separator = match[0];
  const frame = buffer.slice(0, match.index);
  const remainder = buffer.slice(match.index + separator.length);
  return { frame, remainder };
}

export function subscribeToEventSource<T>(
  url: string,
  handlers: EventSourceSubscriptionHandlers<T>,
): () => void {
  const controller = new AbortController();
  let isClosed = false;

  void (async () => {
    let authHeader = getCachedAuthHeader();
    let authAttempt = 0;

    while (!isClosed) {
      try {
        const response = await fetch(url, {
          headers: authHeader ? { Authorization: authHeader } : undefined,
          signal: controller.signal,
        });

        if (response.status === 401 && authAttempt < 1) {
          const recoveredAuthHeader =
            await recoverAuthHeaderAfterUnauthorized();
          if (!recoveredAuthHeader) {
            handlers.onError?.();
            return;
          }

          authHeader = recoveredAuthHeader;
          authAttempt += 1;
          continue;
        }

        if (!response.ok || !response.body) {
          handlers.onError?.();
          return;
        }

        handlers.onOpen?.();

        const decoder = new TextDecoder();
        const reader = response.body.getReader();
        let buffer = "";

        try {
          while (!isClosed) {
            const { done, value } = await reader.read();
            if (done) {
              buffer += decoder.decode();
              break;
            }
            buffer += decoder.decode(value, { stream: true });

            let parsedFrame = readNextFrame(buffer);
            while (parsedFrame) {
              emitParsedFrame(parsedFrame.frame, handlers);
              buffer = parsedFrame.remainder;
              parsedFrame = readNextFrame(buffer);
            }
          }

          const trailingFrame = buffer.trim();
          if (trailingFrame.length > 0) {
            emitParsedFrame(trailingFrame, handlers);
          }
        } finally {
          try {
            await reader.cancel();
          } catch {
            // Ignore cancellation errors when stream is already closed.
          }
        }

        return;
      } catch {
        if (!isClosed && !controller.signal.aborted) {
          handlers.onError?.();
        }
        return;
      }
    }
  })();

  return () => {
    isClosed = true;
    controller.abort();
  };
}
