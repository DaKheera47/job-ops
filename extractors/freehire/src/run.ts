import { getCountryIso2Code } from "@shared/location-support.js";
import type { CreateJobInput } from "@shared/types/jobs";

const FREEHIRE_SEARCH_URL = "https://freehire.me/api/v1/agent/jobs/search";

export interface FreeHireProgressEvent {
  type: "term_start" | "term_complete";
  termIndex: number;
  termTotal: number;
  searchTerm: string;
  jobsFoundTerm?: number;
}

export interface RunFreeHireOptions {
  searchTerms?: string[];
  selectedCountry?: string;
  locations?: string[];
  workplaceTypes?: Array<"remote" | "hybrid" | "onsite">;
  maxJobsPerTerm?: number;
  onProgress?: (event: FreeHireProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface FreeHireResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

export interface FetchFreeHirePageOptions {
  searchTerm: string;
  selectedCountry?: string;
  locations?: string[];
  workplaceTypes?: Array<"remote" | "hybrid" | "onsite">;
  limit: number;
  offset?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface FreeHirePage {
  jobs: CreateJobInput[];
  limit: number;
  offset: number;
  total: number;
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(asString).filter((item): item is string => Boolean(item))
    : [];
}

function asHttpUrl(value: unknown): string | undefined {
  const raw = asString(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function formatSalary(enrichment: UnknownRecord | null): string | undefined {
  const minimum = asNumber(enrichment?.salary_min);
  const maximum = asNumber(enrichment?.salary_max);
  if (minimum === undefined && maximum === undefined) return undefined;

  const format = (value: number) =>
    new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
  const amount =
    minimum !== undefined && maximum !== undefined
      ? `${format(minimum)}–${format(maximum)}`
      : minimum !== undefined
        ? `from ${format(minimum)}`
        : `up to ${format(maximum as number)}`;
  const currency = asString(enrichment?.salary_currency);
  const period = asString(enrichment?.salary_period);

  return `${currency ? `${currency} ` : ""}${amount}${period ? `/${period}` : ""}`;
}

export function mapFreeHireJob(value: unknown): CreateJobInput | null {
  const row = asRecord(value);
  const title = asString(row?.title);
  const employer = asString(row?.company);
  const jobUrl = asHttpUrl(row?.url);
  if (!row || !title || !employer || !jobUrl) return null;

  const enrichment = asRecord(row.enrichment);
  const skills = asStringList(row.skills);
  const domains = asStringList(enrichment?.domains);
  const experienceYears = asNumber(enrichment?.experience_years_min);

  return {
    source: "freehire",
    sourceJobId: asString(row.public_slug) ?? asString(row.external_id),
    title,
    employer,
    jobUrl,
    jobUrlDirect: jobUrl,
    applicationLink: jobUrl,
    location: asString(row.location),
    jobDescription: asString(row.description) ?? asString(enrichment?.summary),
    datePosted: asString(row.posted_at),
    salary: formatSalary(enrichment),
    salaryInterval: asString(enrichment?.salary_period),
    salaryMinAmount: asNumber(enrichment?.salary_min),
    salaryMaxAmount: asNumber(enrichment?.salary_max),
    salaryCurrency: asString(enrichment?.salary_currency),
    jobType: asString(enrichment?.employment_type),
    isRemote: asString(row.work_mode) === "remote",
    jobLevel: asString(enrichment?.seniority),
    jobFunction: asString(enrichment?.category),
    skills: skills.length > 0 ? skills.join(", ") : undefined,
    companyIndustry: domains.length > 0 ? domains.join(", ") : undefined,
    companyNumEmployees: asString(enrichment?.company_size),
    experienceRange:
      experienceYears === undefined ? undefined : `${experienceYears}+ years`,
    workFromHomeType: asString(row.work_mode),
  };
}

export function buildFreeHireSearchUrl(args: {
  searchTerm: string;
  selectedCountry?: string;
  locations?: string[];
  workplaceTypes?: Array<"remote" | "hybrid" | "onsite">;
  limit: number;
  offset?: number;
}): URL {
  const url = new URL(FREEHIRE_SEARCH_URL);
  url.searchParams.set("q", args.searchTerm);
  url.searchParams.set("description_format", "markdown");
  url.searchParams.set("sort", "posted_at");
  url.searchParams.set("order", "desc");
  url.searchParams.set("limit", String(Math.min(100, Math.max(1, args.limit))));
  url.searchParams.set(
    "offset",
    String(Math.max(0, Math.floor(args.offset ?? 0))),
  );

  const countryCode = getCountryIso2Code(args.selectedCountry);
  if (countryCode) url.searchParams.set("countries", countryCode);
  if (args.locations?.length) {
    url.searchParams.set("cities", args.locations.join(","));
  }
  if (args.workplaceTypes?.length) {
    url.searchParams.set("work_mode", args.workplaceTypes.join(","));
  }

  return url;
}

export async function fetchFreeHirePage(
  options: FetchFreeHirePageOptions,
): Promise<FreeHirePage> {
  const requestedLimit = Math.min(100, Math.max(1, Math.floor(options.limit)));
  const requestedOffset = Math.max(0, Math.floor(options.offset ?? 0));
  const response = await (options.fetchImpl ?? fetch)(
    buildFreeHireSearchUrl({
      searchTerm: options.searchTerm,
      selectedCountry: options.selectedCountry,
      locations: options.locations,
      workplaceTypes: options.workplaceTypes,
      limit: requestedLimit,
      offset: requestedOffset,
    }),
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    },
  );
  if (!response.ok) {
    throw new Error(`FreeHire request failed with status ${response.status}`);
  }

  const payload = asRecord((await response.json()) as unknown);
  if (!Array.isArray(payload?.data)) {
    throw new Error("FreeHire returned an invalid jobs response");
  }

  const jobs: CreateJobInput[] = [];
  const seenUrls = new Set<string>();
  for (const value of payload.data) {
    const job = mapFreeHireJob(value);
    if (!job || seenUrls.has(job.jobUrl)) continue;
    seenUrls.add(job.jobUrl);
    jobs.push(job);
  }

  const meta = asRecord(payload.meta);
  return {
    jobs,
    limit: asNumber(meta?.limit) ?? requestedLimit,
    offset: asNumber(meta?.offset) ?? requestedOffset,
    total: asNumber(meta?.total) ?? jobs.length,
  };
}

export async function runFreeHire(
  options: RunFreeHireOptions = {},
): Promise<FreeHireResult> {
  const searchTerms = options.searchTerms?.length
    ? options.searchTerms
    : ["software engineer"];
  const maxJobsPerTerm = Number.isFinite(options.maxJobsPerTerm)
    ? Math.max(1, Math.floor(options.maxJobsPerTerm as number))
    : 50;
  const jobs: CreateJobInput[] = [];
  const seenUrls = new Set<string>();

  try {
    for (const [index, searchTerm] of searchTerms.entries()) {
      if (options.shouldCancel?.()) return { success: true, jobs };

      const termIndex = index + 1;
      options.onProgress?.({
        type: "term_start",
        termIndex,
        termTotal: searchTerms.length,
        searchTerm,
      });

      // ponytail: one API page per term; paginate if runs need more than 100 results per term.
      const page = await fetchFreeHirePage({
        searchTerm,
        selectedCountry: options.selectedCountry,
        locations: options.locations,
        workplaceTypes: options.workplaceTypes,
        limit: maxJobsPerTerm,
        fetchImpl: options.fetchImpl,
      });

      let jobsFoundTerm = 0;
      for (const job of page.jobs) {
        if (seenUrls.has(job.jobUrl)) continue;
        seenUrls.add(job.jobUrl);
        jobs.push(job);
        jobsFoundTerm += 1;
      }

      options.onProgress?.({
        type: "term_complete",
        termIndex,
        termTotal: searchTerms.length,
        searchTerm,
        jobsFoundTerm,
      });
    }

    return { success: true, jobs };
  } catch (error) {
    return {
      success: false,
      jobs: [],
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while running FreeHire extractor",
    };
  }
}
