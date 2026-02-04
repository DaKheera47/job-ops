const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|password|pass|secret|token|api.?key|credential|set-cookie|proxy-authorization|x-api-key)/i;

const DEFAULT_MAX_STRING = 800;
const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_ITEMS = 30;

export function redactString(value: string, max = DEFAULT_MAX_STRING): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…(truncated ${value.length - max} chars)`;
}

export function sanitizeUnknown(
  value: unknown,
  options: { depth?: number; maxItems?: number; maxString?: number } = {},
): unknown {
  const depth = options.depth ?? DEFAULT_MAX_DEPTH;
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;
  const maxString = options.maxString ?? DEFAULT_MAX_STRING;

  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value, maxString);
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (value instanceof Error) {
    return sanitizeError(value);
  }

  if (depth <= 0) {
    return "[TRUNCATED_DEPTH]";
  }

  if (Array.isArray(value)) {
    const limited = value.slice(0, maxItems);
    const out = limited.map((item) =>
      sanitizeUnknown(item, {
        depth: depth - 1,
        maxItems,
        maxString,
      }),
    );
    if (value.length > maxItems) {
      out.push(`[TRUNCATED_ITEMS ${value.length - maxItems}]`);
    }
    return out;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const out: Record<string, unknown> = {};
    for (const [index, [key, entryValue]] of entries.entries()) {
      if (index >= maxItems) {
        out.__truncatedKeys = entries.length - maxItems;
        break;
      }

      if (SENSITIVE_KEY_PATTERN.test(key)) {
        out[key] = REDACTED;
        continue;
      }

      out[key] = sanitizeUnknown(entryValue, {
        depth: depth - 1,
        maxItems,
        maxString,
      });
    }
    return out;
  }

  return String(value);
}

export function sanitizeError(error: Error): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: error.name,
    message: redactString(error.message),
  };

  const maybe = error as Error & {
    status?: number;
    body?: string;
    details?: unknown;
    cause?: unknown;
  };
  if (typeof maybe.status === "number") out.status = maybe.status;
  if (maybe.details !== undefined) out.details = sanitizeUnknown(maybe.details);
  if (maybe.cause !== undefined) out.cause = sanitizeUnknown(maybe.cause);
  if (maybe.body !== undefined) out.body = REDACTED;
  if (error.stack) out.stack = redactString(error.stack, 1200);
  return out;
}

export function sanitizeWebhookPayload(
  payload: unknown,
): Record<string, unknown> {
  const raw = sanitizeUnknown(payload, {
    depth: 4,
    maxItems: 20,
    maxString: 300,
  });
  return (raw && typeof raw === "object" ? raw : { value: raw }) as Record<
    string,
    unknown
  >;
}
