// packages/sources/workday/src/get-jobs-from-cxs.ts

export interface WorkdayCxsFacetValue {
  descriptor?: string;
  id?: string;
  count?: number;
  [key: string]: unknown;
}

export interface WorkdayCxsFacet {
  facetParameter?: string;
  descriptor?: string;
  values?: WorkdayCxsFacetValue[] | WorkdayCxsFacet[];
  [key: string]: unknown;
}

export interface WorkdayCxsJobPosting {
  title?: string;
  externalPath?: string;
  locationsText?: string;
  postedOn?: string;
  bulletFields?: string[];
  [key: string]: unknown;
}

export interface WorkdayCxsJobsResponse {
  total?: number;
  jobPostings?: WorkdayCxsJobPosting[];
  facets?: WorkdayCxsFacet[];
  userAuthenticated?: boolean;
  [key: string]: unknown;
}

export interface NormalizedWorkdayJob {
  source: "workday";
  externalId: string;
  title: string;
  company?: string;
  locationText?: string;
  postedOn?: string;
  jobUrl: string;
  externalPath: string;
  raw: WorkdayCxsJobPosting;
}

export interface FetchWorkdayCxsJobsOptions {
  /**
   * Full CXS jobs URL, e.g.
   * https://pg.wd5.myworkdayjobs.com/wday/cxs/pg/1000/jobs
   */
  cxsJobsUrl: string;

  /**
   * Public careers page URL used to build human-facing job URLs, e.g.
   * https://pg.wd5.myworkdayjobs.com/en-US/1000
   *
   * If omitted, this file falls back to https://host/{site}.
   */
  careersUrl?: string;

  company?: string;
  searchText?: string;
  appliedFacets?: Record<string, unknown>;
  limit?: number;
  maxJobs?: number;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  headers?: HeadersInit;
  userAgent?: string;
  acceptLanguage?: string;
  includeRawResponses?: boolean;
}

export interface FetchWorkdayCxsJobsResult {
  total: number;
  fetched: number;
  jobs: NormalizedWorkdayJob[];
  rawResponses?: WorkdayCxsJobsResponse[];
}

export class WorkdayCxsFetchError extends Error {
  readonly status?: number;
  readonly url: string;
  readonly responseBody?: string;

  constructor(args: {
    message: string;
    url: string;
    status?: number;
    responseBody?: string;
  }) {
    super(args.message);
    this.name = "WorkdayCxsFetchError";
    this.url = args.url;
    this.status = args.status;
    this.responseBody = args.responseBody;
  }
}

const DEFAULT_LIMIT = 20;
const DEFAULT_MAX_JOBS = 500;
const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

/**
 * Fetches and paginates a Workday Candidate Experience jobs endpoint.
 *
 * This intentionally does not know anything about JobOps users, pipelines,
 * scoring, schedules, or database writes. It only talks to the Workday CXS
 * endpoint and returns normalized job records.
 */
export async function getJobsFromCxs(
  options: FetchWorkdayCxsJobsOptions,
): Promise<FetchWorkdayCxsJobsResult> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  if (!fetchFn) {
    throw new WorkdayCxsFetchError({
      url: options.cxsJobsUrl,
      message:
        "No fetch implementation available. Pass fetchImpl or use Node 18+.",
    });
  }

  const cxsUrl = new URL(options.cxsJobsUrl);
  const { tenant, site } = parseCxsJobsUrl(cxsUrl);
  const limit = clampPositiveInteger(options.limit ?? DEFAULT_LIMIT, 1, 100);
  const maxJobs = clampPositiveInteger(
    options.maxJobs ?? DEFAULT_MAX_JOBS,
    1,
    10_000,
  );
  const careersBaseUrl = normalizeCareersBaseUrl(
    options.careersUrl ?? `${cxsUrl.origin}/${site}`,
  );

  const jobs: NormalizedWorkdayJob[] = [];
  const rawResponses: WorkdayCxsJobsResponse[] = [];

  let total = Number.POSITIVE_INFINITY;
  let offset = 0;

  while (offset < total && jobs.length < maxJobs) {
    const pageLimit = Math.min(limit, maxJobs - jobs.length);
    const response = await fetchCxsPage(fetchFn, {
      url: cxsUrl,
      tenant,
      site,
      careersBaseUrl,
      offset,
      limit: pageLimit,
      searchText: options.searchText ?? "",
      appliedFacets: options.appliedFacets ?? {},
      signal: options.signal,
      headers: options.headers,
      userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
      acceptLanguage: options.acceptLanguage ?? "en-US",
    });

    if (options.includeRawResponses) rawResponses.push(response);

    total = typeof response.total === "number" ? response.total : jobs.length;

    const postings = Array.isArray(response.jobPostings)
      ? response.jobPostings
      : [];
    if (postings.length === 0) break;

    for (const posting of postings) {
      jobs.push(
        normalizeWorkdayCxsPosting(posting, {
          company: options.company,
          careersBaseUrl,
        }),
      );
    }

    offset += postings.length;
  }

  return {
    total: Number.isFinite(total) ? total : jobs.length,
    fetched: jobs.length,
    jobs,
    ...(options.includeRawResponses ? { rawResponses } : {}),
  };
}

async function fetchCxsPage(
  fetchFn: typeof fetch,
  args: {
    url: URL;
    tenant: string;
    site: string;
    careersBaseUrl: string;
    offset: number;
    limit: number;
    searchText: string;
    appliedFacets: Record<string, unknown>;
    signal?: AbortSignal;
    headers?: HeadersInit;
    userAgent: string;
    acceptLanguage: string;
  },
): Promise<WorkdayCxsJobsResponse> {
  const body = {
    appliedFacets: args.appliedFacets,
    limit: args.limit,
    offset: args.offset,
    searchText: args.searchText,
  };

  const response = await fetchFn(args.url, {
    method: "POST",
    signal: args.signal,
    headers: {
      accept: "application/json",
      "accept-language": args.acceptLanguage,
      "content-type": "application/json",
      origin: args.url.origin,
      referer: args.careersBaseUrl,
      "user-agent": args.userAgent,
      ...args.headers,
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new WorkdayCxsFetchError({
      url: args.url.toString(),
      status: response.status,
      message: `Workday CXS request failed with HTTP ${response.status}.`,
      responseBody: responseText.slice(0, 2_000),
    });
  }

  try {
    return JSON.parse(responseText) as WorkdayCxsJobsResponse;
  } catch {
    throw new WorkdayCxsFetchError({
      url: args.url.toString(),
      status: response.status,
      message: "Workday CXS response was not valid JSON.",
      responseBody: responseText.slice(0, 2_000),
    });
  }
}

export function normalizeWorkdayCxsPosting(
  posting: WorkdayCxsJobPosting,
  args: { careersBaseUrl: string; company?: string },
): NormalizedWorkdayJob {
  const externalPath = requiredString(posting.externalPath, "externalPath");
  const title = requiredString(posting.title, "title");

  return {
    source: "workday",
    externalId: extractExternalId(posting, externalPath),
    title,
    company: args.company,
    locationText: optionalString(posting.locationsText),
    postedOn: optionalString(posting.postedOn),
    externalPath,
    jobUrl: buildJobUrl(args.careersBaseUrl, externalPath),
    raw: posting,
  };
}

export function parseCxsJobsUrl(url: URL): { tenant: string; site: string } {
  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  const wdayIndex = segments.findIndex(
    (segment) => segment.toLowerCase() === "wday",
  );

  if (wdayIndex === -1) {
    throw new WorkdayCxsFetchError({
      url: url.toString(),
      message: "CXS jobs URL must include /wday/cxs/{tenant}/{site}/jobs.",
    });
  }

  const cxs = segments[wdayIndex + 1];
  const tenant = segments[wdayIndex + 2];
  const site = segments[wdayIndex + 3];
  const jobs = segments[wdayIndex + 4];

  if (
    cxs?.toLowerCase() !== "cxs" ||
    !tenant ||
    !site ||
    jobs?.toLowerCase() !== "jobs"
  ) {
    throw new WorkdayCxsFetchError({
      url: url.toString(),
      message: "CXS jobs URL must look like /wday/cxs/{tenant}/{site}/jobs.",
    });
  }

  return { tenant, site };
}

function buildJobUrl(careersBaseUrl: string, externalPath: string): string {
  const base = normalizeCareersBaseUrl(careersBaseUrl);
  const path = externalPath.startsWith("/") ? externalPath : `/${externalPath}`;
  return `${base}${path}`;
}

function normalizeCareersBaseUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function extractExternalId(
  posting: WorkdayCxsJobPosting,
  externalPath: string,
): string {
  const bulletId = Array.isArray(posting.bulletFields)
    ? posting.bulletFields.find(
        (field) => typeof field === "string" && field.trim(),
      )
    : undefined;

  if (bulletId) return bulletId.trim();

  const pathMatch = externalPath.match(/_([^/_]+(?:-\d+)?)$/);
  if (pathMatch?.[1]) return pathMatch[1];

  return externalPath;
}

function requiredString(value: unknown, fieldName: string): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new WorkdayCxsFetchError({
    url: "unknown",
    message: `Workday job posting is missing required field: ${fieldName}.`,
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function clampPositiveInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}
