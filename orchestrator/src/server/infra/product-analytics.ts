import { getOrCreateAnalyticsInstallState } from "@server/repositories/product-analytics";
import umamiModule from "@umami/node";

import { logger } from "./logger";
import { getRequestContext } from "./request-context";
import { sanitizeUnknown } from "./sanitize";

const UMAMI_HOST_URL = "https://umami.dakheera47.com";
const UMAMI_WEBSITE_ID = "0dc42ed1-87c3-4ac0-9409-5a9b9588fe66";
const UMAMI_FALLBACK_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const DISALLOWED_KEY_PARTS = [
  "query",
  "url",
  "token",
  "secret",
  "password",
  "authorization",
  "cookie",
  "code",
] as const;

type Primitive = string | number | boolean | null;
type AnalyticsPayload = Record<string, Primitive>;
type UmamiClient = {
  init: (options: {
    websiteId: string;
    hostUrl: string;
    userAgent?: string;
  }) => void;
  track: (payload: {
    id?: string;
    timestamp?: number;
    hostname: string;
    url: string;
    name: string;
    data?: AnalyticsPayload;
  }) => Promise<Response>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isUmamiClient(value: unknown): value is UmamiClient {
  if (!isRecord(value)) return false;
  return typeof value.init === "function" && typeof value.track === "function";
}

function getUmamiClient(): UmamiClient {
  if (isUmamiClient(umamiModule)) return umamiModule;

  const moduleRecord = umamiModule as Record<string, unknown>;
  const defaultExport = moduleRecord.default;

  if (isUmamiClient(defaultExport)) {
    return defaultExport;
  }

  throw new TypeError("Invalid @umami/node client export");
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || !isHttpUrl(trimmed)) return null;
  return trimmed.replace(/\/+$/, "");
}

function sanitizeAnalyticsPayload(
  data: Record<string, unknown> | undefined,
): AnalyticsPayload | undefined {
  if (!data) return undefined;

  const sanitized: AnalyticsPayload = {};
  for (const [key, value] of Object.entries(data)) {
    const loweredKey = key.toLowerCase();
    if (DISALLOWED_KEY_PARTS.some((part) => loweredKey.includes(part))) {
      continue;
    }

    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function resolveBaseUrl(requestOrigin?: string | null): string {
  return (
    normalizeBaseUrl(process.env.JOBOPS_PUBLIC_BASE_URL) ??
    normalizeBaseUrl(requestOrigin) ??
    "http://localhost"
  );
}

function buildPagePayload(args: {
  requestOrigin?: string | null;
  urlPath?: string;
}): { hostname: string; url: string } {
  const baseUrl = resolveBaseUrl(args.requestOrigin);
  const resolvedUrl = new URL(args.urlPath ?? "/", baseUrl);
  return {
    hostname: resolvedUrl.hostname,
    url: `${resolvedUrl.pathname}${resolvedUrl.search}`,
  };
}

function toUnixTimestampSeconds(
  value: Date | number | string | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;

  let epochMs: number | null = null;
  if (value instanceof Date) {
    epochMs = value.getTime();
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    epochMs = value < 1_000_000_000_000 ? value * 1000 : value;
  } else if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Date.parse(value);
    if (!Number.isFinite(parsed)) return null;
    epochMs = parsed;
  }

  if (epochMs === null || !Number.isFinite(epochMs)) return null;
  return Math.floor(epochMs / 1000);
}

export async function trackServerProductEvent(
  event: string,
  data?: Record<string, unknown>,
  options?: {
    distinctId?: string | null;
    occurredAt?: Date | number | string | null;
    requestOrigin?: string | null;
    requestUserAgent?: string | null;
    sessionId?: string | null;
    urlPath?: string;
  },
): Promise<boolean> {
  if (process.env.NODE_ENV === "test") return false;
  if (typeof fetch !== "function") return false;

  const requestContext = getRequestContext();
  const sessionId =
    options?.sessionId?.trim() ||
    requestContext?.analyticsSessionId?.trim() ||
    null;
  const sanitized = sanitizeAnalyticsPayload({
    ...(data ?? {}),
    ...(sessionId ? { sessionId } : {}),
  });
  const page = buildPagePayload({
    requestOrigin: options?.requestOrigin,
    urlPath: options?.urlPath,
  });
  const timestamp = toUnixTimestampSeconds(options?.occurredAt);

  try {
    const installState = options?.distinctId
      ? { distinctId: options.distinctId }
      : await getOrCreateAnalyticsInstallState();
    const umami = getUmamiClient();
    umami.init({
      websiteId: UMAMI_WEBSITE_ID,
      hostUrl: UMAMI_HOST_URL,
      userAgent:
        options?.requestUserAgent?.trim() ||
        requestContext?.requestUserAgent?.trim() ||
        UMAMI_FALLBACK_USER_AGENT,
    });
    const response = await umami.track({
      id: installState.distinctId,
      ...(timestamp !== null ? { timestamp } : {}),
      hostname: page.hostname,
      url: page.url,
      name: event,
      ...(sanitized ? { data: sanitized } : {}),
    });

    if (!response.ok) {
      logger.warn("Server product analytics request failed", {
        event,
        status: response.status,
        requestOrigin: options?.requestOrigin ?? null,
        urlPath: options?.urlPath ?? "/",
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.warn("Server product analytics request errored", {
      event,
      requestOrigin: options?.requestOrigin ?? null,
      urlPath: options?.urlPath ?? "/",
      error: sanitizeUnknown(error),
    });
    return false;
  }
}
