import {
  type BamboohrSourceConfig,
  bamboohrUrlToJobUrl,
  parseBamboohrUrl,
} from "./bamboohr-url";

export interface BamboohrLocation {
  city?: string | null;
  state?: string | null;
}

export interface BamboohrAtsLocation {
  country?: string | null;
  state?: string | null;
  province?: string | null;
  city?: string | null;
}

export interface BamboohrListJob {
  id?: string;
  jobOpeningName?: string;
  employmentStatusLabel?: string | null;
  location?: BamboohrLocation | null;
  atsLocation?: BamboohrAtsLocation | null;
  isRemote?: boolean | null;
  locationType?: string | null;
  [key: string]: unknown;
}

export interface BamboohrListResponse {
  meta?: {
    totalCount?: number;
    [key: string]: unknown;
  };
  result?: BamboohrListJob[];
  [key: string]: unknown;
}

export interface NormalizedBamboohrJob {
  source: "bamboohr";
  externalId: string;
  title: string;
  jobUrl: string;
  locationText?: string;
  employmentStatus?: string;
  raw: BamboohrListJob;
}

export interface FetchBamboohrJobsOptions {
  careersUrl: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  headers?: HeadersInit;
  userAgent?: string;
}

export interface FetchBamboohrJobsResult {
  total: number;
  fetched: number;
  jobs: NormalizedBamboohrJob[];
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function getJobsFromCareersList(
  options: FetchBamboohrJobsOptions,
): Promise<FetchBamboohrJobsResult> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error(
      "No fetch implementation available. Pass fetchImpl or use Node 18+.",
    );
  }

  const source = parseBamboohrUrl(options.careersUrl);
  const response = await fetchBamboohrJson<BamboohrListResponse>(fetchFn, {
    url: source.listUrl,
    signal: options.signal,
    headers: {
      accept: "application/json",
      referer: source.canonicalCareersUrl,
      "user-agent": options.userAgent ?? DEFAULT_USER_AGENT,
      ...options.headers,
    },
  });

  const rows = Array.isArray(response.result) ? response.result : [];
  const jobs = rows.map((job) => normalizeBamboohrListJob(job, source));
  const total =
    typeof response.meta?.totalCount === "number"
      ? response.meta.totalCount
      : jobs.length;

  return {
    total,
    fetched: jobs.length,
    jobs,
  };
}

export function normalizeBamboohrListJob(
  job: BamboohrListJob,
  source: BamboohrSourceConfig,
): NormalizedBamboohrJob {
  const externalId = requiredString(job.id, "id", source.listUrl);
  const title = requiredString(
    job.jobOpeningName,
    "jobOpeningName",
    source.listUrl,
  );

  return {
    source: "bamboohr",
    externalId,
    title,
    jobUrl: bamboohrUrlToJobUrl(source.canonicalCareersUrl, externalId),
    locationText: buildLocationText(job),
    employmentStatus: optionalString(job.employmentStatusLabel),
    raw: job,
  };
}

function buildLocationText(job: BamboohrListJob): string | undefined {
  const parts = [
    optionalString(job.location?.city),
    optionalString(job.location?.state),
    optionalString(job.atsLocation?.city),
    optionalString(job.atsLocation?.state),
    optionalString(job.atsLocation?.province),
    optionalString(job.atsLocation?.country),
  ].filter((value, index, values): value is string => {
    if (!value) return false;
    return values.indexOf(value) === index;
  });

  if (job.isRemote === true && !parts.includes("Remote")) {
    parts.unshift("Remote");
  }

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
