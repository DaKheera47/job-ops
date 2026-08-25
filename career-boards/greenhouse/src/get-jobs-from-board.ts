import {
  GREENHOUSE_DEFAULT_USER_AGENT,
  type GreenhouseSourceConfig,
  greenhouseJobApiUrl,
  parseGreenhouseUrl,
} from "./greenhouse-url";

export interface GreenhouseListLocation {
  name?: string | null;
}

export interface GreenhouseListJob {
  id?: number | string;
  title?: string;
  absolute_url?: string;
  location?: GreenhouseListLocation | null;
  updated_at?: string | null;
  first_published?: string | null;
  company_name?: string | null;
  requisition_id?: string | null;
  [key: string]: unknown;
}

export interface GreenhouseListResponse {
  jobs?: GreenhouseListJob[];
  meta?: { total?: number };
  [key: string]: unknown;
}

export interface NormalizedGreenhouseJob {
  source: "greenhouse";
  externalId: string;
  title: string;
  jobUrl: string;
  jobApiUrl: string;
  locationText?: string;
  postedOn?: string;
  company?: string;
  raw: GreenhouseListJob;
}

export interface FetchGreenhouseJobsOptions {
  careersUrl: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  headers?: HeadersInit;
  userAgent?: string;
}

export interface FetchGreenhouseJobsResult {
  total: number;
  fetched: number;
  jobs: NormalizedGreenhouseJob[];
}

export async function getJobsFromBoard(
  options: FetchGreenhouseJobsOptions,
): Promise<FetchGreenhouseJobsResult> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error(
      "No fetch implementation available. Pass fetchImpl or use Node 18+.",
    );
  }

  const source = parseGreenhouseUrl(options.careersUrl);
  const response = await fetchGreenhouseJson<GreenhouseListResponse>(fetchFn, {
    url: source.boardJobsUrl,
    signal: options.signal,
    headers: {
      accept: "application/json",
      referer: source.canonicalCareersUrl,
      "user-agent": options.userAgent ?? GREENHOUSE_DEFAULT_USER_AGENT,
      ...options.headers,
    },
  });

  const rows = Array.isArray(response.jobs) ? response.jobs : [];
  const jobs = rows.map((job) => normalizeGreenhouseListJob(job, source));
  const total =
    typeof response.meta?.total === "number"
      ? response.meta.total
      : jobs.length;

  return {
    total,
    fetched: jobs.length,
    jobs,
  };
}

export function normalizeGreenhouseListJob(
  job: GreenhouseListJob,
  source: GreenhouseSourceConfig,
): NormalizedGreenhouseJob {
  const externalId = requiredString(job.id, "id", source.boardJobsUrl);
  const title = requiredString(job.title, "title", source.boardJobsUrl);

  return {
    source: "greenhouse",
    externalId,
    title,
    jobUrl: optionalString(job.absolute_url) ?? source.canonicalCareersUrl,
    jobApiUrl: greenhouseJobApiUrl(source.token, externalId),
    locationText: formatLocation(job.location?.name),
    postedOn:
      optionalString(job.first_published) ?? optionalString(job.updated_at),
    company: optionalString(job.company_name),
    raw: job,
  };
}

export function formatLocation(
  value: string | null | undefined,
): string | undefined {
  const text = optionalString(value);
  if (!text) return undefined;
  // Greenhouse joins location parts without spaces
  // ("Larkspur,California,United States") and emits the literal "BLANK" as a
  // placeholder for empty components (e.g. "BLANK,BLANK,Multiple Locations").
  const parts = text
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part.toUpperCase() !== "BLANK");
  return parts.length > 0 ? parts.join(", ") : undefined;
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
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(
    `Greenhouse response is missing required field ${fieldName} for ${url}.`,
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
