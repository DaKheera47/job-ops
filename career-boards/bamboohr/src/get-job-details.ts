import {
  type BamboohrSourceConfig,
  bamboohrUrlToJobUrl,
  parseBamboohrJobUrl,
} from "./bamboohr-url";

export interface BamboohrJobOpeningLocation {
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  addressCountry?: string | null;
}

export interface BamboohrJobOpening {
  jobOpeningShareUrl?: string;
  jobOpeningName?: string;
  employmentStatusLabel?: string | null;
  location?: BamboohrJobOpeningLocation | null;
  atsLocation?: {
    country?: string | null;
    state?: string | null;
    city?: string | null;
  } | null;
  description?: string;
  datePosted?: string | null;
  minimumExperience?: string | null;
  locationType?: string | null;
  [key: string]: unknown;
}

export interface BamboohrDetailResponse {
  meta?: Record<string, unknown>;
  result?: {
    jobOpening?: BamboohrJobOpening;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface NormalizedBamboohrJobDetails {
  source: "bamboohr";
  externalId: string;
  title: string;
  jobUrl: string;
  locationText?: string;
  postedOn?: string;
  employmentStatus?: string;
  minimumExperience?: string;
  jobDescriptionHtml: string;
  jobDescriptionText: string;
  raw: BamboohrDetailResponse;
}

export interface FetchBamboohrJobDetailsOptions {
  jobUrl: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  headers?: HeadersInit;
  userAgent?: string;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function getJobDetails(
  options: FetchBamboohrJobDetailsOptions,
): Promise<{ job: NormalizedBamboohrJobDetails }> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error(
      "No fetch implementation available. Pass fetchImpl or use Node 18+.",
    );
  }

  const parsed = parseBamboohrJobUrl(options.jobUrl);
  const response = await fetchBamboohrJson<BamboohrDetailResponse>(fetchFn, {
    url: parsed.detailUrl,
    signal: options.signal,
    headers: {
      accept: "application/json",
      referer: parsed.canonicalJobUrl,
      "user-agent": options.userAgent ?? DEFAULT_USER_AGENT,
      ...options.headers,
    },
  });

  return {
    job: normalizeBamboohrJobDetails(response, parsed),
  };
}

export function normalizeBamboohrJobDetails(
  response: BamboohrDetailResponse,
  source: BamboohrSourceConfig & { jobId: string; canonicalJobUrl: string },
): NormalizedBamboohrJobDetails {
  const jobOpening = response.result?.jobOpening;
  if (!jobOpening) {
    throw new Error(
      `BambooHR job detail response is missing result.jobOpening for ${source.canonicalJobUrl}.`,
    );
  }

  const title = requiredString(
    jobOpening.jobOpeningName,
    "jobOpeningName",
    source.canonicalJobUrl,
  );
  const descriptionHtml = requiredString(
    jobOpening.description,
    "description",
    source.canonicalJobUrl,
  );
  const shareUrl =
    optionalString(jobOpening.jobOpeningShareUrl) ??
    bamboohrUrlToJobUrl(source.canonicalCareersUrl, source.jobId);

  return {
    source: "bamboohr",
    externalId: source.jobId,
    title,
    jobUrl: shareUrl,
    locationText: buildLocationText(jobOpening),
    postedOn: optionalString(jobOpening.datePosted),
    employmentStatus: optionalString(jobOpening.employmentStatusLabel),
    minimumExperience: optionalString(jobOpening.minimumExperience),
    jobDescriptionHtml: descriptionHtml,
    jobDescriptionText: htmlToText(descriptionHtml),
    raw: response,
  };
}

function buildLocationText(jobOpening: BamboohrJobOpening): string | undefined {
  const parts = [
    optionalString(jobOpening.location?.city),
    optionalString(jobOpening.location?.state),
    optionalString(jobOpening.location?.addressCountry),
    optionalString(jobOpening.atsLocation?.city),
    optionalString(jobOpening.atsLocation?.state),
    optionalString(jobOpening.atsLocation?.country),
  ].filter((value, index, values): value is string => {
    if (!value) return false;
    return values.indexOf(value) === index;
  });

  return parts.length > 0 ? parts.join(", ") : undefined;
}

async function fetchBamboohrJson<T>(
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
      `BambooHR request failed with HTTP ${response.status} for ${input.url}.`,
    );
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`BambooHR response was not valid JSON for ${input.url}.`);
  }
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

function requiredString(
  value: unknown,
  fieldName: string,
  url: string,
): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(
    `BambooHR response is missing required field ${fieldName} for ${url}.`,
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
