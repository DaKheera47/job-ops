import { getOrCreateAnalyticsInstallState } from "@server/repositories/product-analytics";
import umamiModule from "@umami/node";
import { withAnalyticsMetadata } from "@/lib/analytics-metadata";

import { logger } from "./logger";
import { getRequestContext } from "./request-context";
import { sanitizeUnknown } from "./sanitize";

const UMAMI_HOST_URL = "https://umami.dakheera47.com";
const UMAMI_WEBSITE_ID = "0dc42ed1-87c3-4ac0-9409-5a9b9588fe66";
const OPENPANEL_API_BASE_URL = "https://openpanel.dakheera47.com/api";
const OPENPANEL_CLIENT_ID = "6a953241-309b-4e5a-be1b-412c5d7b6544";
const OPENPANEL_CLIENT_SECRET = "sec_906d37f958321fef9adb";
const UMAMI_FALLBACK_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const OPENPANEL_FALLBACK_USER_AGENT = "jobops-orchestrator/1.0";
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

function getServerAnalyticsAppVersion(): string | null {
  const envVersion = process.env.JOBOPS_APP_VERSION?.trim();
  if (envVersion) return envVersion;
  const npmVersion = process.env.npm_package_version?.trim();
  if (!npmVersion) return null;
  return npmVersion.startsWith("v") ? npmVersion : `v${npmVersion}`;
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

function toIsoTimestamp(
  value: Date | number | string | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;

  let date: Date | null = null;
  if (value instanceof Date) {
    date = value;
  } else if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const epochMs = value < 1_000_000_000_000 ? value * 1000 : value;
    date = new Date(epochMs);
  } else if (typeof value === "string" && value.trim().length > 0) {
    date = new Date(value);
  }

  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getOpenPanelTrackUrl(): string | null {
  const configuredBaseUrl = normalizeBaseUrl(
    process.env.JOBOPS_OPENPANEL_API_URL ?? OPENPANEL_API_BASE_URL,
  );
  if (!configuredBaseUrl) return null;
  return `${configuredBaseUrl}/track`;
}

function getOpenPanelClientId(): string | null {
  const configured = process.env.JOBOPS_OPENPANEL_CLIENT_ID?.trim();
  return configured || OPENPANEL_CLIENT_ID;
}

function getOpenPanelClientSecret(): string | null {
  const configured = process.env.JOBOPS_OPENPANEL_CLIENT_SECRET?.trim();
  return configured || OPENPANEL_CLIENT_SECRET;
}

async function trackOpenPanelProductEvent(args: {
  event: string;
  profileId: string;
  data?: AnalyticsPayload;
  occurredAt?: Date | number | string | null;
  requestUserAgent?: string | null;
  requestOrigin?: string | null;
  urlPath: string;
}): Promise<boolean> {
  const trackUrl = getOpenPanelTrackUrl();
  const clientId = getOpenPanelClientId();
  const clientSecret = getOpenPanelClientSecret();
  if (!trackUrl || !clientId || !clientSecret) {
    return false;
  }

  const properties: AnalyticsPayload = {
    ...(args.data ?? {}),
    __path: args.urlPath,
  };
  const timestamp = toIsoTimestamp(args.occurredAt);
  if (timestamp) {
    properties.__timestamp = timestamp;
  }

  const requestContext = getRequestContext();
  const response = await fetch(trackUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "openpanel-client-id": clientId,
      "openpanel-client-secret": clientSecret,
      "user-agent":
        args.requestUserAgent?.trim() ||
        requestContext?.requestUserAgent?.trim() ||
        OPENPANEL_FALLBACK_USER_AGENT,
    },
    body: JSON.stringify({
      type: "track",
      payload: {
        name: args.event,
        profileId: args.profileId,
        properties,
      },
    }),
  });

  if (!response.ok) {
    logger.warn("Server product analytics request failed", {
      provider: "openpanel",
      event: args.event,
      status: response.status,
      requestOrigin: args.requestOrigin ?? null,
      urlPath: args.urlPath,
    });
    return false;
  }

  return true;
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
  const isoTimestamp = toIsoTimestamp(options?.occurredAt);

  try {
    const installState = options?.distinctId
      ? { distinctId: options.distinctId }
      : await getOrCreateAnalyticsInstallState();
    const payload = withAnalyticsMetadata(sanitized, {
      analyticsUserId: installState.distinctId,
      appVersion: getServerAnalyticsAppVersion(),
    });
    const umami = getUmamiClient();
    umami.init({
      websiteId: UMAMI_WEBSITE_ID,
      hostUrl: UMAMI_HOST_URL,
      userAgent:
        options?.requestUserAgent?.trim() ||
        requestContext?.requestUserAgent?.trim() ||
        UMAMI_FALLBACK_USER_AGENT,
    });
    const [umamiResponse, openPanelDelivered] = await Promise.all([
      umami
        .track({
          id: installState.distinctId,
          ...(timestamp !== null ? { timestamp } : {}),
          hostname: page.hostname,
          url: page.url,
          name: event,
          ...(payload ? { data: payload } : {}),
        })
        .catch((error) => {
          logger.warn("Server product analytics request errored", {
            provider: "umami",
            event,
            requestOrigin: options?.requestOrigin ?? null,
            urlPath: options?.urlPath ?? "/",
            error: sanitizeUnknown(error),
          });
          return null;
        }),
      trackOpenPanelProductEvent({
        event,
        profileId: installState.distinctId,
        data: payload,
        occurredAt: isoTimestamp,
        requestUserAgent: options?.requestUserAgent,
        requestOrigin: options?.requestOrigin,
        urlPath: page.url,
      }).catch((error) => {
        logger.warn("Server product analytics request errored", {
          provider: "openpanel",
          event,
          requestOrigin: options?.requestOrigin ?? null,
          urlPath: options?.urlPath ?? "/",
          error: sanitizeUnknown(error),
        });
        return false;
      }),
    ]);

    const umamiDelivered = umamiResponse?.ok ?? false;
    if (umamiResponse && !umamiDelivered) {
      logger.warn("Server product analytics request failed", {
        provider: "umami",
        event,
        status: umamiResponse.status,
        requestOrigin: options?.requestOrigin ?? null,
        urlPath: options?.urlPath ?? "/",
      });
    }

    return umamiDelivered || openPanelDelivered;
  } catch (error) {
    logger.warn("Server product analytics request errored", {
      provider: "umami",
      event,
      requestOrigin: options?.requestOrigin ?? null,
      urlPath: options?.urlPath ?? "/",
      error: sanitizeUnknown(error),
    });
    return false;
  }
}
