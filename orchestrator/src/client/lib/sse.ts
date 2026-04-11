import {
  clearBasicAuthCredentials,
  getCachedBasicAuthHeader,
  getCachedBasicAuthUsername,
  hasBasicAuthPromptHandler,
  requestBasicAuthHeader,
} from "@client/api/client";

interface EventSourceSubscriptionHandlers<T> {
  onOpen?: () => void;
  onMessage: (payload: T) => void;
  onError?: () => void;
}

function shouldUseAuthenticatedSseFetch(): boolean {
  return hasBasicAuthPromptHandler() || Boolean(getCachedBasicAuthHeader());
}

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

export function subscribeToEventSource<T>(
  url: string,
  handlers: EventSourceSubscriptionHandlers<T>,
): () => void {
  if (shouldUseAuthenticatedSseFetch()) {
    const controller = new AbortController();
    let isClosed = false;

    void (async () => {
      let authHeader = getCachedBasicAuthHeader();
      let authAttempt = 0;
      let usernameHint = getCachedBasicAuthUsername();

      while (!isClosed) {
        try {
          const response = await fetch(url, {
            headers: authHeader ? { Authorization: authHeader } : undefined,
            signal: controller.signal,
          });

          if (response.status === 401 && hasBasicAuthPromptHandler()) {
            clearBasicAuthCredentials();
            if (authAttempt >= 2) {
              handlers.onError?.();
              return;
            }

            const nextAuthHeader = await requestBasicAuthHeader({
              endpoint: url,
              method: "GET",
              attempt: authAttempt + 1,
              usernameHint,
              errorMessage:
                authAttempt > 0
                  ? "Invalid credentials. Please try again."
                  : undefined,
            });
            if (!nextAuthHeader) {
              handlers.onError?.();
              return;
            }

            authHeader = nextAuthHeader;
            usernameHint = getCachedBasicAuthUsername();
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
              if (done) break;
              buffer += decoder.decode(value, { stream: true });

              let separatorIndex = buffer.indexOf("\n\n");
              while (separatorIndex !== -1) {
                const frame = buffer.slice(0, separatorIndex);
                buffer = buffer.slice(separatorIndex + 2);

                const data = parseSseFrame(frame);
                if (data) {
                  try {
                    handlers.onMessage(JSON.parse(data) as T);
                  } catch {
                    // Ignore malformed events to keep stream resilient.
                  }
                }

                separatorIndex = buffer.indexOf("\n\n");
              }
            }
          } finally {
            await reader.cancel();
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

  const eventSource = new EventSource(url);

  eventSource.onopen = () => {
    handlers.onOpen?.();
  };

  eventSource.onmessage = (event) => {
    try {
      handlers.onMessage(JSON.parse(event.data) as T);
    } catch {
      // Ignore malformed events to keep stream resilient.
    }
  };

  eventSource.onerror = () => {
    handlers.onError?.();
  };

  return () => {
    eventSource.close();
  };
}
