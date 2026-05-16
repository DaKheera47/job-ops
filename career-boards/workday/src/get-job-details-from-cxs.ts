import { WorkdayCxsFetchError } from "./get-jobs-from-cxs";
import { parseWorkdayJobUrl } from "./workday-url-to-cxs";

export interface WorkdayCxsJobPostingInfo {
  id?: string;
  title?: string;
  jobDescription?: string;
  location?: string;
  additionalLocations?: string[];
  postedOn?: string;
  startDate?: string;
  timeType?: string;
  jobReqId?: string;
  jobPostingId?: string;
  jobPostingSiteId?: string;
  country?: string;
  canApply?: boolean;
  posted?: boolean;
  externalUrl?: string;
  timeLeftToApply?: string;
  endDate?: string;
  jobPostingEndDateAsText?: string;
  [key: string]: unknown;
}

export interface WorkdayCxsHiringOrganization {
  name?: string;
  url?: string;
  [key: string]: unknown;
}

export interface WorkdayCxsJobDetailResponse {
  jobPostingInfo?: WorkdayCxsJobPostingInfo;
  hiringOrganization?: WorkdayCxsHiringOrganization;
  similarJobs?: unknown[];
  userAuthenticated?: boolean;
  [key: string]: unknown;
}

export interface NormalizedWorkdayJobDetails {
  source: "workday";
  externalId: string;
  title: string;
  company?: string;
  locationText?: string;
  additionalLocations?: string[];
  postedOn?: string;
  timeType?: string;
  jobDescriptionHtml: string;
  jobDescriptionText: string;
  jobUrl: string;
  cxsJobUrl: string;
  externalPath: string;
  raw: WorkdayCxsJobDetailResponse;
}

export interface FetchWorkdayCxsJobDetailsOptions {
  /**
   * Public Workday job URL, e.g.
   * https://pg.wd5.myworkdayjobs.com/en-US/1000/job/Foo_R123
   */
  jobUrl: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  headers?: HeadersInit;
  userAgent?: string;
  acceptLanguage?: string;
  includeRawResponse?: boolean;
}

export interface FetchWorkdayCxsJobDetailsResult {
  job: NormalizedWorkdayJobDetails;
  rawResponse?: WorkdayCxsJobDetailResponse;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

/**
 * Fetches a Workday Candidate Experience job detail endpoint and normalizes the
 * HTML job description alongside the core posting metadata.
 */
export async function getJobDetailsFromCxs(
  options: FetchWorkdayCxsJobDetailsOptions,
): Promise<FetchWorkdayCxsJobDetailsResult> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;

  if (!fetchFn) {
    throw new WorkdayCxsFetchError({
      url: options.jobUrl,
      message:
        "No fetch implementation available. Pass fetchImpl or use Node 18+.",
    });
  }

  const parsed = parseWorkdayJobUrl(options.jobUrl);
  const response = await fetchCxsJobDetails(fetchFn, {
    cxsJobUrl: parsed.cxsJobUrl,
    jobUrl: parsed.canonicalJobUrl,
    signal: options.signal,
    headers: options.headers,
    userAgent: options.userAgent ?? DEFAULT_USER_AGENT,
    acceptLanguage: options.acceptLanguage ?? "en-US",
  });

  const job = normalizeWorkdayCxsJobDetails(response, {
    cxsJobUrl: parsed.cxsJobUrl,
    externalPath: parsed.externalPath,
    jobUrl: parsed.canonicalJobUrl,
  });

  return {
    job,
    ...(options.includeRawResponse ? { rawResponse: response } : {}),
  };
}

async function fetchCxsJobDetails(
  fetchFn: typeof fetch,
  args: {
    cxsJobUrl: string;
    jobUrl: string;
    signal?: AbortSignal;
    headers?: HeadersInit;
    userAgent: string;
    acceptLanguage: string;
  },
): Promise<WorkdayCxsJobDetailResponse> {
  const response = await fetchFn(args.cxsJobUrl, {
    method: "GET",
    signal: args.signal,
    headers: {
      accept: "application/json",
      "accept-language": args.acceptLanguage,
      referer: args.jobUrl,
      "user-agent": args.userAgent,
      ...args.headers,
    },
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new WorkdayCxsFetchError({
      url: args.cxsJobUrl,
      status: response.status,
      message: `Workday CXS job detail request failed with HTTP ${response.status}.`,
      responseBody: responseText.slice(0, 2_000),
    });
  }

  try {
    return JSON.parse(responseText) as WorkdayCxsJobDetailResponse;
  } catch {
    throw new WorkdayCxsFetchError({
      url: args.cxsJobUrl,
      status: response.status,
      message: "Workday CXS job detail response was not valid JSON.",
      responseBody: responseText.slice(0, 2_000),
    });
  }
}

export function normalizeWorkdayCxsJobDetails(
  response: WorkdayCxsJobDetailResponse,
  args: { cxsJobUrl: string; externalPath: string; jobUrl: string },
): NormalizedWorkdayJobDetails {
  const posting = response.jobPostingInfo;

  if (!posting) {
    throw new WorkdayCxsFetchError({
      url: args.cxsJobUrl,
      message: "Workday job detail response is missing jobPostingInfo.",
    });
  }

  const title = requiredString(posting.title, "title", args.cxsJobUrl);
  const jobDescriptionHtml = requiredString(
    posting.jobDescription,
    "jobDescription",
    args.cxsJobUrl,
  );

  return {
    source: "workday",
    externalId: optionalString(posting.jobReqId) ?? args.externalPath,
    title,
    company: optionalString(response.hiringOrganization?.name),
    locationText: optionalString(posting.location),
    additionalLocations: Array.isArray(posting.additionalLocations)
      ? posting.additionalLocations.filter(
          (location): location is string =>
            typeof location === "string" && location.trim().length > 0,
        )
      : undefined,
    postedOn: optionalString(posting.postedOn),
    timeType: optionalString(posting.timeType),
    jobDescriptionHtml,
    jobDescriptionText: htmlToText(jobDescriptionHtml),
    jobUrl: args.jobUrl,
    cxsJobUrl: args.cxsJobUrl,
    externalPath: args.externalPath,
    raw: response,
  };
}

function requiredString(
  value: unknown,
  fieldName: string,
  url: string,
): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new WorkdayCxsFetchError({
    url,
    message: `Workday job detail is missing required field: ${fieldName}.`,
  });
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
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
