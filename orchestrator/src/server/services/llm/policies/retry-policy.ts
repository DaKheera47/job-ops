export function shouldRetryAttempt(args: {
  message: string;
  status?: number;
}): boolean {
  return (
    args.message.includes("parse") ||
    args.status === 429 ||
    (args.status !== undefined && args.status >= 500 && args.status <= 599) ||
    args.message.toLowerCase().includes("timeout") ||
    args.message.toLowerCase().includes("timed out") ||
    args.message.toLowerCase().includes("fetch failed")
  );
}

const MAX_RETRY_DELAY_MS = 60_000;

/**
 * Exponential backoff with full jitter. Returns at least 1ms.
 * If `retryAfterMs` is provided (from a 429 Retry-After header), it's used as
 * the floor — jittered exponential is layered on top to avoid thundering herd
 * when many concurrent requests share the same Retry-After value.
 */
export function getRetryDelayMs(
  baseDelayMs: number,
  attempt: number,
  retryAfterMs?: number,
): number {
  const expBackoff = baseDelayMs * 2 ** (attempt - 1);
  const capped = Math.min(expBackoff, MAX_RETRY_DELAY_MS);
  const jittered = Math.random() * capped;
  const floor = retryAfterMs && retryAfterMs > 0 ? retryAfterMs : 0;
  return Math.max(1, Math.floor(floor + jittered));
}

/**
 * Parse a `Retry-After` header value (seconds or HTTP-date) into milliseconds.
 * Returns undefined for missing/invalid values.
 */
export function parseRetryAfterMs(
  headerValue: string | null | undefined,
): number | undefined {
  if (!headerValue) return undefined;
  const trimmed = headerValue.trim();
  if (trimmed === "") return undefined;

  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000);
  }

  const dateMs = Date.parse(trimmed);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return undefined;
}
