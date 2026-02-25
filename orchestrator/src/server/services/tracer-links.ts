import { createHash } from "node:crypto";
import { logger } from "@infra/logger";
import type {
  JobTracerLinksResponse,
  TracerAnalyticsResponse,
  TracerReadinessResponse,
} from "@shared/types";
import * as tracerLinksRepo from "../repositories/tracer-links";

type LinkNode = {
  label?: unknown;
  href?: unknown;
};

type LinkTarget = {
  sourcePath: string;
  sourceLabel: string;
  destinationUrl: string;
  applyTracerUrl: (url: string) => void;
};

const BOT_UA_PATTERN =
  /\b(bot|crawler|spider|preview|scanner|security|headless|curl|wget|slackbot|discordbot|facebookexternalhit|whatsapp|skypeuripreview|linkedinbot|googleimageproxy)\b/i;
const TRACER_READINESS_TIMEOUT_MS = 5_000;
const TRACER_READINESS_CACHE_TTL_MS = 5 * 60_000;

type TracerReadinessCacheEntry = {
  baseUrl: string | null;
  checkedAt: number;
  response: TracerReadinessResponse;
};

let tracerReadinessCache: TracerReadinessCacheEntry | null = null;
let tracerReadinessLastSuccessAt: number | null = null;

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizeLettersOnly(
  value: string | null | undefined,
  fallback: string,
  maxLength: number,
): string {
  if (!value) return fallback;

  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, maxLength);

  return normalized.length > 0 ? normalized : fallback;
}

function normalizeBaseUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isHttpUrl(trimmed)) return null;
  return trimmed.replace(/\/+$/, "");
}

function isLocalOrPrivateHostname(hostnameRaw: string): boolean {
  const hostname = hostnameRaw.trim().toLowerCase();
  if (!hostname) return true;

  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    return true;
  }

  const ipv4Match = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map((part) => Number(part));
    if (octets.some((octet) => Number.isNaN(octet) || octet > 255)) return true;
    const [first, second] = octets;
    if (
      first === 10 ||
      first === 127 ||
      first === 0 ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168)
    ) {
      return true;
    }
  }

  if (hostname.includes(":")) {
    if (
      hostname === "::1" ||
      hostname.startsWith("fe80:") ||
      hostname.startsWith("fc") ||
      hostname.startsWith("fd")
    ) {
      return true;
    }
  }

  if (!hostname.includes(".") && !hostname.includes(":")) {
    return true;
  }

  return false;
}

function resolveTracerReadinessBaseUrl(args: {
  requestOrigin?: string | null;
}): string | null {
  const fromEnv = normalizeBaseUrl(process.env.JOBOPS_PUBLIC_BASE_URL ?? null);
  if (fromEnv) return fromEnv;
  return normalizeBaseUrl(args.requestOrigin);
}

function makeTracerReadinessResponse(
  status: TracerReadinessResponse["status"],
  args: {
    baseUrl: string | null;
    checkedAt: number;
    reason: string | null;
  },
): TracerReadinessResponse {
  return {
    status,
    canEnable: status === "ready",
    publicBaseUrl: args.baseUrl,
    healthUrl: args.baseUrl ? `${args.baseUrl}/health` : null,
    checkedAt: args.checkedAt,
    lastSuccessAt: tracerReadinessLastSuccessAt,
    reason: args.reason,
  };
}

async function fetchWithTimeout(
  input: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain",
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function deriveSourceLabel(sourcePath: string, linkNode: LinkNode): string {
  const label = typeof linkNode.label === "string" ? linkNode.label.trim() : "";
  if (label.length > 0) return label.slice(0, 200);
  if (sourcePath === "basics.url.href") return "Portfolio";

  const sectionMatch = sourcePath.match(
    /^sections\.([a-z]+)\.items\[(\d+)\]\.url\.href$/,
  );
  if (sectionMatch) {
    const section = sectionMatch[1];
    const index = Number(sectionMatch[2]);
    const nth = Number.isFinite(index) ? index + 1 : null;
    const sectionLabels: Record<string, string> = {
      profiles: "Profile",
      projects: "Project",
      experience: "Experience",
      education: "Education",
      awards: "Award",
      certificates: "Certificate",
      publications: "Publication",
      volunteer: "Volunteer",
    };
    const baseLabel = sectionLabels[section] ?? "Resume";
    return nth ? `${baseLabel} Link ${nth}` : `${baseLabel} Link`;
  }

  const v5SectionMatch = sourcePath.match(
    /^sections\.([a-z]+)\.items\[(\d+)\]\.website\.url$/,
  );
  if (v5SectionMatch) {
    const section = v5SectionMatch[1];
    const index = Number(v5SectionMatch[2]);
    const nth = Number.isFinite(index) ? index + 1 : null;
    const sectionLabels: Record<string, string> = {
      projects: "Project",
      experience: "Experience",
      education: "Education",
    };
    const baseLabel = sectionLabels[section] ?? "Resume";
    return nth ? `${baseLabel} Link ${nth}` : `${baseLabel} Link`;
  }

  if (sourcePath === "basics.website.url") return "Portfolio";

  return "Resume Link";
}

function buildReadableSlugPrefix(companyName?: string | null): string {
  const company = sanitizeLettersOnly(companyName, "company", 30);
  return company;
}

function collectUrlTargets(
  node: unknown,
  path: string,
  targets: LinkTarget[],
): void {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      const nextPath = `${path}[${index}]`;
      collectUrlTargets(item, nextPath, targets);
    }
    return;
  }

  if (!isRecord(node)) return;

  for (const [key, value] of Object.entries(node)) {
    const nextPath = path.length > 0 ? `${path}.${key}` : key;

    if (key === "url" && isRecord(value)) {
      const linkNode = value as LinkNode;
      const rawHref =
        typeof linkNode.href === "string" ? linkNode.href.trim() : "";
      if (rawHref && isHttpUrl(rawHref)) {
        const sourcePath = `${nextPath}.href`;
        targets.push({
          sourcePath,
          sourceLabel: deriveSourceLabel(sourcePath, linkNode),
          destinationUrl: rawHref,
          applyTracerUrl: (url: string) => {
            const linkValue = value as { href?: unknown; label?: unknown };
            const currentLabel =
              typeof linkValue.label === "string" ? linkValue.label.trim() : "";

            linkValue.href = url;

            // Preserve descriptive labels; only rewrite label text when it was
            // empty or mirrored the original destination URL.
            if (!currentLabel || currentLabel === rawHref) {
              linkValue.label = url;
            }
          },
        });
      }
      continue;
    }

    if (key === "website" && isRecord(value)) {
      const linkValue = value as { url?: unknown; label?: unknown };
      const rawHref =
        typeof linkValue.url === "string" ? linkValue.url.trim() : "";
      if (rawHref && isHttpUrl(rawHref)) {
        const sourcePath = `${nextPath}.url`;
        targets.push({
          sourcePath,
          sourceLabel: deriveSourceLabel(sourcePath, {
            label: linkValue.label,
            href: rawHref,
          }),
          destinationUrl: rawHref,
          applyTracerUrl: (url: string) => {
            const currentLabel =
              typeof linkValue.label === "string" ? linkValue.label.trim() : "";
            linkValue.url = url;
            if (!currentLabel || currentLabel === rawHref) {
              linkValue.label = url;
            }
          },
        });
      }
      continue;
    }

    collectUrlTargets(value, nextPath, targets);
  }
}

function dayBucketFromUnixSeconds(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

function normalizeIpPrefix(ip: string | null): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (!trimmed) return null;

  // Common Express format for IPv4-mapped IPv6
  const clean = trimmed.startsWith("::ffff:") ? trimmed.slice(7) : trimmed;

  if (/^\d+\.\d+\.\d+\.\d+$/.test(clean)) {
    const parts = clean.split(".");
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }

  if (clean.includes(":")) {
    const normalized = clean
      .split(":")
      .filter((part) => part.length > 0)
      .slice(0, 4)
      .join(":");
    if (!normalized) return null;
    return `${normalized}::/64`;
  }

  return null;
}

function getReferrerHost(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const host = new URL(referrer).host;
    return host || null;
  } catch {
    return null;
  }
}

function classifyDeviceType(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/(tablet|ipad)/.test(ua)) return "tablet";
  if (/(mobile|iphone|android)/.test(ua)) return "mobile";
  if (/(windows|macintosh|linux|x11|cros)/.test(ua)) return "desktop";
  return "unknown";
}

function classifyUaFamily(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (BOT_UA_PATTERN.test(ua)) return "bot";
  if (ua.includes("edg/")) return "edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "opera";
  if (ua.includes("chrome/")) return "chrome";
  if (ua.includes("firefox/")) return "firefox";
  if (ua.includes("safari/")) return "safari";
  return "unknown";
}

function classifyOsFamily(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ios"))
    return "ios";
  if (ua.includes("mac os") || ua.includes("macintosh")) return "macos";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

function isLikelyBotUserAgent(userAgent: string): boolean {
  return BOT_UA_PATTERN.test(userAgent);
}

export function resolveTracerPublicBaseUrl(args: {
  requestOrigin?: string | null;
}): string | null {
  const fromRequest = normalizeBaseUrl(args.requestOrigin);
  if (fromRequest) return fromRequest;
  return normalizeBaseUrl(process.env.JOBOPS_PUBLIC_BASE_URL ?? null);
}

export async function getTracerReadiness(
  args: { requestOrigin?: string | null; force?: boolean } = {},
): Promise<TracerReadinessResponse> {
  const baseUrl = resolveTracerReadinessBaseUrl({
    requestOrigin: args.requestOrigin,
  });
  const checkedAt = Date.now();
  const force = Boolean(args.force);

  const cached = tracerReadinessCache;
  if (
    !force &&
    cached &&
    cached.baseUrl === baseUrl &&
    checkedAt - cached.checkedAt < TRACER_READINESS_CACHE_TTL_MS
  ) {
    return cached.response;
  }

  let response: TracerReadinessResponse;

  if (!baseUrl) {
    response = makeTracerReadinessResponse("unconfigured", {
      baseUrl: null,
      checkedAt,
      reason:
        "No public JobOps base URL is configured. Set JOBOPS_PUBLIC_BASE_URL.",
    });
  } else {
    let hostname: string | null = null;
    try {
      hostname = new URL(baseUrl).hostname;
    } catch {
      hostname = null;
    }

    if (!hostname || isLocalOrPrivateHostname(hostname)) {
      response = makeTracerReadinessResponse("unavailable", {
        baseUrl,
        checkedAt,
        reason:
          "Configured public URL must be internet-reachable (not localhost/private network).",
      });
    } else {
      const healthUrl = `${baseUrl}/health`;

      try {
        const healthResponse = await fetchWithTimeout(
          healthUrl,
          TRACER_READINESS_TIMEOUT_MS,
        );

        if (!healthResponse.ok) {
          response = makeTracerReadinessResponse("unavailable", {
            baseUrl,
            checkedAt,
            reason: `Health check returned HTTP ${healthResponse.status}.`,
          });
        } else {
          tracerReadinessLastSuccessAt = checkedAt;
          response = makeTracerReadinessResponse("ready", {
            baseUrl,
            checkedAt,
            reason: null,
          });
        }
      } catch (error) {
        const reason =
          error instanceof Error && error.name === "AbortError"
            ? `Health check timed out after ${TRACER_READINESS_TIMEOUT_MS}ms.`
            : error instanceof Error
              ? `Health check failed: ${error.message}.`
              : "Health check failed.";

        response = makeTracerReadinessResponse("unavailable", {
          baseUrl,
          checkedAt,
          reason,
        });
      }
    }
  }

  tracerReadinessCache = {
    baseUrl,
    checkedAt,
    response,
  };

  if (response.status === "ready") {
    logger.info("Tracer readiness check passed", {
      route: "tracer-readiness",
      publicBaseUrl: response.publicBaseUrl,
      checkedAt: response.checkedAt,
    });
  } else {
    logger.warn("Tracer readiness check failed", {
      route: "tracer-readiness",
      status: response.status,
      publicBaseUrl: response.publicBaseUrl,
      reason: response.reason,
      checkedAt: response.checkedAt,
    });
  }

  return response;
}

export function _resetTracerReadinessCacheForTests(): void {
  tracerReadinessCache = null;
  tracerReadinessLastSuccessAt = null;
}

export async function rewriteResumeLinksWithTracer(args: {
  jobId: string;
  resumeData: unknown;
  publicBaseUrl: string;
  companyName?: string | null;
}): Promise<{ rewrittenLinks: number }> {
  const targets: LinkTarget[] = [];
  collectUrlTargets(args.resumeData, "", targets);
  const slugPrefix = buildReadableSlugPrefix(args.companyName);

  for (const target of targets) {
    const destinationUrlHash = hashText(target.destinationUrl);
    const link = await tracerLinksRepo.getOrCreateTracerLink({
      jobId: args.jobId,
      sourcePath: target.sourcePath,
      sourceLabel: target.sourceLabel,
      destinationUrl: target.destinationUrl,
      destinationUrlHash,
      slugPrefix,
    });
    target.applyTracerUrl(`${args.publicBaseUrl}/cv/${link.token}`);
  }

  return { rewrittenLinks: targets.length };
}

export async function resolveTracerRedirect(args: {
  token: string;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  referrer: string | null;
}): Promise<{ destinationUrl: string; jobId: string } | null> {
  const link = await tracerLinksRepo.findActiveTracerLinkByToken(args.token);
  if (!link) return null;
  if (!isHttpUrl(link.destinationUrl)) {
    logger.warn("Tracer link destination rejected: invalid scheme", {
      route: "resolve-tracer-redirect",
      token: args.token,
      jobId: link.jobId,
    });
    return null;
  }

  const clickedAt = Math.floor(Date.now() / 1000);
  const dayBucket = dayBucketFromUnixSeconds(clickedAt);
  const userAgent = args.userAgent?.trim() ?? "";
  const ipPrefix = normalizeIpPrefix(args.ip);
  const ipHash = ipPrefix ? hashText(ipPrefix) : null;
  const uniqueFingerprintSource = `${ipPrefix ?? "na"}|${userAgent.toLowerCase() || "na"}|${dayBucket}`;
  const uniqueFingerprintHash =
    ipPrefix || userAgent ? hashText(uniqueFingerprintSource) : null;
  const isLikelyBot = isLikelyBotUserAgent(userAgent);

  await tracerLinksRepo.insertTracerClickEvent({
    tracerLinkId: link.id,
    clickedAt,
    requestId: args.requestId,
    isLikelyBot,
    deviceType: classifyDeviceType(userAgent),
    uaFamily: classifyUaFamily(userAgent),
    osFamily: classifyOsFamily(userAgent),
    referrerHost: getReferrerHost(args.referrer),
    ipHash,
    uniqueFingerprintHash,
  });

  return {
    destinationUrl: link.destinationUrl,
    jobId: link.jobId,
  };
}

export async function getTracerAnalytics(args: {
  jobId?: string | null;
  from?: number | null;
  to?: number | null;
  includeBots?: boolean;
  limit?: number;
}): Promise<TracerAnalyticsResponse> {
  const includeBots = Boolean(args.includeBots);
  const limit = Number.isFinite(args.limit)
    ? Math.max(1, args.limit ?? 20)
    : 20;

  const [totals, timeSeries, topJobs, topLinks] = await Promise.all([
    tracerLinksRepo.getTracerAnalyticsTotals({
      ...args,
      includeBots,
      limit,
    }),
    tracerLinksRepo.getTracerAnalyticsTimeSeries({
      ...args,
      includeBots,
      limit,
    }),
    tracerLinksRepo.getTracerAnalyticsTopJobs({
      ...args,
      includeBots,
      limit,
    }),
    tracerLinksRepo.getTracerAnalyticsTopLinks({
      ...args,
      includeBots,
      limit,
    }),
  ]);

  return {
    filters: {
      jobId: args.jobId ?? null,
      from: args.from ?? null,
      to: args.to ?? null,
      includeBots,
      limit,
    },
    totals,
    timeSeries,
    topJobs,
    topLinks,
  };
}

export async function getJobTracerLinksAnalytics(args: {
  jobId: string;
  from?: number | null;
  to?: number | null;
  includeBots?: boolean;
  title: string;
  employer: string;
  tracerLinksEnabled: boolean;
}): Promise<JobTracerLinksResponse> {
  const includeBots = Boolean(args.includeBots);

  const links = await tracerLinksRepo.listTracerLinkStatsByJob(args.jobId, {
    from: args.from,
    to: args.to,
    includeBots,
  });

  const totals = links.reduce(
    (acc, item) => {
      acc.links += 1;
      acc.clicks += item.clicks;
      acc.uniqueOpens += item.uniqueOpens;
      acc.botClicks += item.botClicks;
      acc.humanClicks += item.humanClicks;
      return acc;
    },
    {
      links: 0,
      clicks: 0,
      uniqueOpens: 0,
      botClicks: 0,
      humanClicks: 0,
    },
  );

  return {
    job: {
      id: args.jobId,
      title: args.title,
      employer: args.employer,
      tracerLinksEnabled: args.tracerLinksEnabled,
    },
    totals,
    links,
  };
}
