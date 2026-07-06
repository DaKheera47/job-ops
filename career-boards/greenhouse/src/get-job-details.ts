import { formatLocation } from "./get-jobs-from-board";
import {
  GREENHOUSE_DEFAULT_USER_AGENT,
  greenhouseJobApiUrl,
  parseGreenhouseJobApiUrl,
} from "./greenhouse-url";

export interface GreenhouseDetailResponse {
  id?: number | string;
  title?: string;
  absolute_url?: string;
  location?: { name?: string | null } | null;
  content?: string;
  updated_at?: string | null;
  first_published?: string | null;
  company_name?: string | null;
  departments?: Array<{ name?: string | null }> | null;
  [key: string]: unknown;
}

export interface NormalizedGreenhouseJobDetails {
  source: "greenhouse";
  externalId: string;
  title: string;
  jobUrl: string;
  jobApiUrl: string;
  locationText?: string;
  postedOn?: string;
  company?: string;
  department?: string;
  jobDescriptionHtml: string;
  jobDescriptionText: string;
  raw: GreenhouseDetailResponse;
}

export interface FetchGreenhouseJobDetailsOptions {
  /** A Greenhouse board job API URL: `.../v1/boards/<token>/jobs/<id>`. */
  jobRef: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  headers?: HeadersInit;
  userAgent?: string;
}

export async function getJobDetails(
  options: FetchGreenhouseJobDetailsOptions,
): Promise<{ job: NormalizedGreenhouseJobDetails }> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error(
      "No fetch implementation available. Pass fetchImpl or use Node 18+.",
    );
  }

  const { token, jobId } = parseGreenhouseJobApiUrl(options.jobRef);
  const detailUrl = greenhouseJobApiUrl(token, jobId);
  const response = await fetchGreenhouseJson<GreenhouseDetailResponse>(
    fetchFn,
    {
      url: detailUrl,
      signal: options.signal,
      headers: {
        accept: "application/json",
        "user-agent": options.userAgent ?? GREENHOUSE_DEFAULT_USER_AGENT,
        ...options.headers,
      },
    },
  );

  return {
    job: normalizeGreenhouseJobDetails(response, { token, jobId, detailUrl }),
  };
}

export function normalizeGreenhouseJobDetails(
  response: GreenhouseDetailResponse,
  ref: { token: string; jobId: string; detailUrl: string },
): NormalizedGreenhouseJobDetails {
  const title = requiredString(response.title, "title", ref.detailUrl);
  // Greenhouse returns `content` as an HTML-entity-encoded string.
  const decodedHtml = decodeHtmlEntities(
    requiredString(response.content, "content", ref.detailUrl),
  );

  return {
    source: "greenhouse",
    externalId: ref.jobId,
    title,
    jobUrl: optionalString(response.absolute_url) ?? ref.detailUrl,
    jobApiUrl: ref.detailUrl,
    locationText: formatLocation(response.location?.name),
    postedOn:
      optionalString(response.first_published) ??
      optionalString(response.updated_at),
    company: optionalString(response.company_name),
    department: optionalString(response.departments?.[0]?.name),
    jobDescriptionHtml: decodedHtml,
    jobDescriptionText: htmlToText(decodedHtml),
    raw: response,
  };
}

/**
 * Decodes HTML entities in a single pass. Greenhouse double-encodes job
 * `content` (e.g. `&lt;p&gt;` for `<p>`), so one decode pass restores the
 * intended HTML while leaving legitimately-encoded inner entities intact.
 */
export function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    lt: "<",
    gt: ">",
    amp: "&",
    quot: '"',
    apos: "'",
    nbsp: " ",
  };
  return input.replace(
    /&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g,
    (m, ent) => {
      if (ent[0] === "#") {
        const isHex = ent[1] === "x" || ent[1] === "X";
        const code = isHex
          ? Number.parseInt(ent.slice(2), 16)
          : Number.parseInt(ent.slice(1), 10);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
        try {
          return String.fromCodePoint(code);
        } catch {
          return m;
        }
      }
      return named[ent.toLowerCase()] ?? m;
    },
  );
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6]|ul|ol)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchGreenhouseJson<T>(
  fetchFn: typeof fetch,
  input: {
    url: string;
    signal?: AbortSignal;
    headers?: HeadersInit;
  },
): Promise<T> {
  const response = await fetchFn(input.url, {
    method: "GET",
    signal: input.signal,
    headers: input.headers,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Greenhouse request failed with HTTP ${response.status} for ${input.url}.`,
    );
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`Greenhouse response was not valid JSON for ${input.url}.`);
  }
}

function requiredString(
  value: unknown,
  fieldName: string,
  url: string,
): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(
    `Greenhouse response is missing required field ${fieldName} for ${url}.`,
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
