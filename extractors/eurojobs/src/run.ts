import { getCountryIso2Code } from "@shared/location-support.js";
import type { CreateJobInput } from "@shared/types/jobs";

const EUROJOBS_JOBS_URL = "https://eurojobs.ai/api/v1/jobs";
const EUROJOBS_MAX_PAGE_SIZE = 100;
// Upper bound on list requests per search term and city, whatever the result
// setting asks for (5 pages x 100 jobs).
const EUROJOBS_MAX_PAGES = 5;
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

type WorkplaceType = "remote" | "hybrid" | "onsite";

export interface EuroJobsProgressEvent {
  type: "term_start" | "term_complete";
  termIndex: number;
  termTotal: number;
  searchTerm: string;
  jobsFoundTerm?: number;
}

export interface RunEuroJobsOptions {
  searchTerms?: string[];
  selectedCountry?: string;
  locations?: string[];
  workplaceTypes?: WorkplaceType[];
  maxJobsPerTerm?: number;
  /** Jobs already stored by JobOps; their full descriptions are not refetched. */
  existingJobUrls?: string[];
  /** Fetch each new job's full description from the detail endpoint. */
  fetchDescriptions?: boolean;
  onProgress?: (event: EuroJobsProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface EuroJobsResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

export interface EuroJobsPage {
  jobs: CreateJobInput[];
  rowCount: number;
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

function asId(value: unknown): string | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : asString(value);
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

function asWorkplaceType(value: unknown): WorkplaceType | undefined {
  return value === "remote" || value === "hybrid" || value === "onsite"
    ? value
    : undefined;
}

function countryNameFromCode(code: string | undefined): string | undefined {
  if (!code || !/^[a-z]{2}$/i.test(code)) return undefined;
  const upper = code.toUpperCase();
  try {
    const name = REGION_NAMES.of(upper);
    return name && name !== upper ? name : undefined;
  } catch {
    return undefined;
  }
}

function formatSalary(salary: UnknownRecord | null): string | undefined {
  const minimum = asNumber(salary?.min);
  const maximum = asNumber(salary?.max);
  if (minimum === undefined && maximum === undefined) return undefined;

  const format = (value: number) =>
    new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
  const amount =
    minimum !== undefined && maximum !== undefined && minimum !== maximum
      ? `${format(minimum)}–${format(maximum)}`
      : minimum !== undefined && maximum !== undefined
        ? format(minimum)
        : minimum !== undefined
          ? `from ${format(minimum)}`
          : `up to ${format(maximum as number)}`;
  const currency = asString(salary?.currency);
  const period = asString(salary?.period);

  return `${currency ? `${currency} ` : ""}${amount}${period ? `/${period}` : ""}`;
}

const BLOCK_TAG = /<\/?(?:p|div|br|h[1-6]|ul|ol|section|article|tr)\b[^>]*>/gi;
const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Converts EuroJobs description HTML into readable plain text. */
export function euroJobsHtmlToText(html: string): string {
  return html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(BLOCK_TAG, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === "#") {
        const code =
          entity[1]?.toLowerCase() === "x"
            ? Number.parseInt(entity.slice(2), 16)
            : Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** EuroJobs city filters take English city slugs such as `berlin` or `zurich`. */
export function toEuroJobsLocationSlug(city: string): string | undefined {
  const slug = city
    .split(",")[0]
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || undefined;
}

export function mapEuroJobsJob(value: unknown): CreateJobInput | null {
  const row = asRecord(value);
  const title = asString(row?.title);
  const employer = asString(row?.company_name);
  // The EuroJobs job page is the listing link. `apply_url` passes through a
  // EuroJobs sign-in step, so it is not used as a direct employer link.
  const jobUrl = asHttpUrl(row?.url);
  if (!row || !title || !employer || !jobUrl) return null;

  const location = asString(row.location);
  const city = asString(row.city);
  const countries = asStringList(row.countries);
  const country = countryNameFromCode(
    countries.length > 1 ? undefined : (asString(row.country) ?? countries[0]),
  );
  const workplaceType = asWorkplaceType(row.work_mode);
  const isRemote = row.remote === true || workplaceType === "remote";
  const salary = asRecord(row.salary);
  const skills = asStringList(row.skills);

  return {
    source: "eurojobs",
    sourceJobId: asId(row.id),
    title,
    employer,
    jobUrl,
    applicationLink: jobUrl,
    location,
    locationEvidence: {
      location,
      city,
      country,
      regionHints:
        countries.length > 1
          ? countries
              .map(countryNameFromCode)
              .filter((name): name is string => Boolean(name))
          : undefined,
      workplaceType,
      isRemote,
      isHybrid: workplaceType === "hybrid",
      source: "eurojobs",
    },
    jobDescription: asString(row.description_snippet),
    datePosted: asString(row.posted_at),
    salary: formatSalary(salary),
    salaryInterval: asString(salary?.period),
    salaryMinAmount: asNumber(salary?.min),
    salaryMaxAmount: asNumber(salary?.max),
    salaryCurrency: asString(salary?.currency),
    jobType: asString(row.employment_type),
    isRemote,
    jobLevel: asString(row.seniority),
    jobFunction: asString(row.role_family),
    skills: skills.length > 0 ? skills.join(", ") : undefined,
    vacancyCount: asNumber(row.openings),
    workFromHomeType: workplaceType,
  };
}

export function buildEuroJobsSearchUrl(args: {
  searchTerm: string;
  selectedCountry?: string;
  location?: string;
  workplaceTypes?: WorkplaceType[];
  page?: number;
  perPage: number;
}): URL {
  const url = new URL(EUROJOBS_JOBS_URL);
  url.searchParams.set("q", args.searchTerm);

  const countryCode = getCountryIso2Code(args.selectedCountry);
  if (countryCode) url.searchParams.set("country", countryCode);
  const location = args.location
    ? toEuroJobsLocationSlug(args.location)
    : undefined;
  if (location) url.searchParams.set("location", location);
  // The API only filters for remote; hybrid and onsite are filtered locally.
  if (
    args.workplaceTypes?.length === 1 &&
    args.workplaceTypes[0] === "remote"
  ) {
    url.searchParams.set("remote", "true");
  }

  url.searchParams.set("page", String(Math.max(1, Math.floor(args.page ?? 1))));
  url.searchParams.set(
    "per_page",
    String(
      Math.min(EUROJOBS_MAX_PAGE_SIZE, Math.max(1, Math.floor(args.perPage))),
    ),
  );
  return url;
}

export async function fetchEuroJobsPage(options: {
  searchTerm: string;
  selectedCountry?: string;
  location?: string;
  workplaceTypes?: WorkplaceType[];
  page?: number;
  perPage: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<EuroJobsPage> {
  const response = await (options.fetchImpl ?? fetch)(
    buildEuroJobsSearchUrl(options),
    {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
    },
  );
  if (!response.ok) {
    throw new Error(`EuroJobs request failed with status ${response.status}`);
  }

  const payload = asRecord((await response.json()) as unknown);
  if (!Array.isArray(payload?.data)) {
    throw new Error("EuroJobs returned an invalid jobs response");
  }

  const jobs = payload.data
    .map(mapEuroJobsJob)
    .filter((job): job is CreateJobInput => Boolean(job));
  return {
    jobs,
    rowCount: payload.data.length,
    total: asNumber(asRecord(payload.meta)?.total) ?? payload.data.length,
  };
}

/** Returns the job's full description as plain text, or undefined on failure. */
export async function fetchEuroJobsDescription(
  sourceJobId: string,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<string | undefined> {
  try {
    const response = await (options.fetchImpl ?? fetch)(
      `${EUROJOBS_JOBS_URL}/${encodeURIComponent(sourceJobId)}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(options.timeoutMs ?? 20_000),
      },
    );
    if (!response.ok) return undefined;
    const payload = asRecord((await response.json()) as unknown);
    const html = asString(asRecord(payload?.data)?.description_html);
    return html ? euroJobsHtmlToText(html) || undefined : undefined;
  } catch {
    return undefined;
  }
}

function matchesWorkplaceTypes(
  job: CreateJobInput,
  workplaceTypes: WorkplaceType[] | undefined,
): boolean {
  if (!workplaceTypes?.length) return true;
  const workplaceType = asWorkplaceType(job.workFromHomeType);
  return !workplaceType || workplaceTypes.includes(workplaceType);
}

export async function runEuroJobs(
  options: RunEuroJobsOptions = {},
): Promise<EuroJobsResult> {
  const searchTerms = options.searchTerms?.length
    ? options.searchTerms
    : ["software engineer"];
  const maxJobsPerTerm = Number.isFinite(options.maxJobsPerTerm)
    ? Math.max(1, Math.floor(options.maxJobsPerTerm as number))
    : 50;
  // Country names in the city list (for example "Germany") are covered by
  // the country filter, so only real cities become city filters.
  const cities = (options.locations ?? []).filter(
    (location) => !getCountryIso2Code(location),
  );
  const locations: Array<string | undefined> = cities.length
    ? cities
    : [undefined];
  const maxJobsPerLocation = Math.max(
    1,
    Math.ceil(maxJobsPerTerm / locations.length),
  );
  const perPage = Math.min(EUROJOBS_MAX_PAGE_SIZE, maxJobsPerLocation);
  const existingUrls = new Set(options.existingJobUrls ?? []);
  const fetchDescriptions = options.fetchDescriptions ?? true;
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

      let jobsFoundTerm = 0;
      for (const location of locations) {
        let jobsFoundLocation = 0;
        // Requests run one at a time to keep load on the public API low.
        for (let page = 1; page <= EUROJOBS_MAX_PAGES; page += 1) {
          if (options.shouldCancel?.()) return { success: true, jobs };

          const result = await fetchEuroJobsPage({
            searchTerm,
            selectedCountry: options.selectedCountry,
            location,
            workplaceTypes: options.workplaceTypes,
            page,
            perPage,
            fetchImpl: options.fetchImpl,
          });

          for (const job of result.jobs) {
            if (jobsFoundLocation >= maxJobsPerLocation) break;
            if (seenUrls.has(job.jobUrl)) continue;
            if (!matchesWorkplaceTypes(job, options.workplaceTypes)) continue;
            seenUrls.add(job.jobUrl);

            if (
              fetchDescriptions &&
              job.sourceJobId &&
              !existingUrls.has(job.jobUrl) &&
              !options.shouldCancel?.()
            ) {
              const description = await fetchEuroJobsDescription(
                job.sourceJobId,
                { fetchImpl: options.fetchImpl },
              );
              if (description) job.jobDescription = description;
            }

            jobs.push(job);
            jobsFoundLocation += 1;
            jobsFoundTerm += 1;
          }

          if (
            jobsFoundLocation >= maxJobsPerLocation ||
            result.rowCount < perPage ||
            page * perPage >= result.total
          ) {
            break;
          }
        }
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
          : "Unexpected error while running EuroJobs extractor",
    };
  }
}
