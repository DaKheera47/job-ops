import { normalizeCountryKey } from "@shared/location-support.js";
import {
  resolveSearchCities,
  shouldApplyStrictCityFilter,
} from "@shared/search-cities.js";
import type { CreateJobInput, JobLocationEvidence } from "@shared/types/jobs";
import type { LocationProximity } from "@shared/types/location.js";
import {
  toNumberOrNull,
  toStringOrNull,
} from "@shared/utils/type-conversion.js";
import type { HiringCafeBrowserPages } from "./browser-pages.js";
import {
  type HiringCafeCountryLocation,
  resolveHiringCafeCountryLocation,
} from "./country-map.js";
import { createDefaultSearchState } from "./default-search-state.js";

// hiring.cafe now 308-redirects to hiringcafe.com; target it directly so
// challenge cookies are solved and reused on the same domain.
const BASE_URL = "https://hiringcafe.com/";
const JOB_DETAIL_BASE_URL = "https://hiringcafe.com/job/";
// The site sits behind Cloudflare with Vercel hosting underneath — either
// layer can serve the interstitial.
const CHALLENGE_BODY_PATTERN =
  /cloudflare|cf-browser-verification|challenge-platform|vercel security checkpoint|vercel-protection|_vcrcs/i;
// Cloudflare rate-limits bursts of requests (429 + managed challenge after
// ~4 rapid hits), so space requests out and back off before giving up.
const REQUEST_DELAY_MS = 800;
const RATE_LIMIT_RETRY_DELAYS_MS = [5_000, 15_000];
const DEFAULT_MAX_JOBS_PER_TERM = 200;
const DEFAULT_SEARCH_TERM = "web developer";
const DEFAULT_DATE_FETCHED_PAST_N_DAYS = 30;
const DEFAULT_LOCATION_RADIUS_MILES = 50;
const PAGE_LIMIT = 50;

type HiringCafeRawJob = Record<string, unknown>;
type HiringCafeWorkplaceType = "Remote" | "Hybrid" | "Onsite";

interface CityLocationContext {
  id: string;
  city: string;
  regionLong: string;
  regionShort: string;
  countryLong: string;
  countryShort: string;
  lat: number;
  lon: number;
  formattedAddress: string;
  population: number | null;
  radiusMiles: number;
}

interface NominatimResult {
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: Record<string, unknown>;
}

export interface HiringCafeSsrPage {
  jobs: HiringCafeRawJob[];
  page: number;
  totalCount: number | null;
  pageSize: number | null;
  isLastPage: boolean;
}

export interface HiringCafeSearchResume {
  locationIndex: number;
  termIndex: number;
  location: string | null;
  searchTerm: string;
  pageNo: number;
  termCollected: number;
  searchState: string;
  seenKeys: string[];
  pendingDetailChallengeUrl?: string;
}

export type HiringCafeProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "page_fetched";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      pageNo: number;
      resultsOnPage: number;
      totalCollected: number;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export interface RunHiringCafeOptions {
  searchTerms?: string[];
  country?: string;
  countryKey?: string;
  locations?: string[];
  workplaceTypes?: Array<"remote" | "hybrid" | "onsite">;
  locationRadiusMiles?: number;
  proximity?: LocationProximity;
  maxJobsPerTerm?: number;
  retryChallengeUrl?: string;
  searchResume?: HiringCafeSearchResume;
  skippedChallengeSearchStates?: string[];
  cookieStorageDir?: string;
  pageReader?: Pick<HiringCafeBrowserPages, "read">;
  fetchImpl?: typeof fetch;
  shouldCancel?: () => boolean;
  onProgress?: (event: HiringCafeProgressEvent) => void;
}

export interface HiringCafeResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
  sourceErrors?: string[];
  /** URL that needs a human to solve a Cloudflare challenge in a headed browser */
  challengeRequired?: string;
  searchResume?: HiringCafeSearchResume;
}

class HiringCafeChallengeError extends Error {
  readonly challengeUrl: string;
  readonly status?: number;

  constructor(challengeUrl = BASE_URL, status?: number) {
    super("Hiring Cafe returned a challenge page.");
    this.name = "HiringCafeChallengeError";
    this.challengeUrl = challengeUrl;
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Spaces requests out and retries 429 rate-limit responses with backoff, so a
 * burst of detail-page fetches doesn't trip Cloudflare's rate rule (which
 * serves a challenge page no human solve can meaningfully fix).
 */
function withThrottleAndRetry(fetchImpl: typeof fetch): typeof fetch {
  let lastRequestAt = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    for (let attempt = 0; ; attempt += 1) {
      const wait = lastRequestAt + REQUEST_DELAY_MS - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        const response = await fetchImpl(input, init);
        lastRequestAt = Date.now();
        if (
          response.status !== 429 ||
          attempt >= RATE_LIMIT_RETRY_DELAYS_MS.length
        ) {
          return response;
        }
      } catch (error) {
        lastRequestAt = Date.now();
        if (
          !(error instanceof HiringCafeChallengeError) ||
          error.status !== 429 ||
          attempt >= RATE_LIMIT_RETRY_DELAYS_MS.length
        ) {
          throw error;
        }
      }
      await sleep(RATE_LIMIT_RETRY_DELAYS_MS[attempt]);
    }
  }) as typeof fetch;
}

function toPositiveIntOrFallback(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value as number));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => toStringOrNull(item))
    .filter((item): item is string => Boolean(item));
}

function firstArrayValue(value: unknown): string | null {
  const values = asStringArray(value);
  return values.length > 0 ? values[0] : null;
}

function parseWorkplaceTypes(
  raw: RunHiringCafeOptions["workplaceTypes"],
): HiringCafeWorkplaceType[] {
  if (!raw || raw.length === 0) return ["Remote", "Hybrid", "Onsite"];

  const out: HiringCafeWorkplaceType[] = [];
  const seen = new Set<HiringCafeWorkplaceType>();
  for (const value of raw) {
    const mapped =
      value === "remote"
        ? "Remote"
        : value === "hybrid"
          ? "Hybrid"
          : value === "onsite"
            ? "Onsite"
            : null;
    if (!mapped || seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
  }
  return out.length > 0 ? out : ["Remote", "Hybrid", "Onsite"];
}

function formatCompensation(
  processedJobData: Record<string, unknown> | null,
): string | undefined {
  if (!processedJobData) return undefined;

  const min = toNumberOrNull(processedJobData.yearly_min_compensation);
  const max = toNumberOrNull(processedJobData.yearly_max_compensation);
  if (min === null && max === null) return undefined;

  const currency = toStringOrNull(
    processedJobData.listed_compensation_currency,
  );
  const frequency =
    toStringOrNull(processedJobData.listed_compensation_frequency) ?? "Yearly";
  const amount = formatCompensationAmount(min, max);

  const parts = [currency, amount, frequency ? `/ ${frequency}` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  return parts || undefined;
}

function formatCompensationAmount(
  min: number | null,
  max: number | null,
): string {
  if (min !== null && max !== null) {
    return `${Math.round(min)}-${Math.round(max)}`;
  }
  if (min !== null) return `${Math.round(min)}+`;
  return `${Math.round(max ?? 0)}`;
}

function buildLocationEvidence(args: {
  formattedLocation?: string | null;
  cities: string[];
  states: string[];
  countries: string[];
}): JobLocationEvidence | undefined {
  const location =
    args.formattedLocation ??
    args.cities[0] ??
    args.states[0] ??
    args.countries[0];

  const city = args.cities[0];
  const country = args.countries[0];

  if (!location && !city && !country) return undefined;

  return {
    location,
    city,
    country,
    source: "hiringcafe",
  };
}

function getHiringCafeSourceJobId(raw: HiringCafeRawJob): string | undefined {
  return (
    toStringOrNull(raw.id) ??
    toStringOrNull(raw.objectID) ??
    toStringOrNull(raw.original_source_id) ??
    toStringOrNull(raw.requisition_id) ??
    undefined
  );
}

function getHiringCafeRequisitionId(raw: HiringCafeRawJob): string | null {
  return toStringOrNull(raw.requisition_id);
}

function hasJobDescription(raw: HiringCafeRawJob): boolean {
  const jobInformation = asRecord(raw.job_information);
  return Boolean(toStringOrNull(jobInformation?.description));
}

function getHiringCafeDedupeKey(raw: HiringCafeRawJob): string | null {
  return getHiringCafeSourceJobId(raw) ?? toStringOrNull(raw.apply_url);
}

function mapHiringCafeJob(raw: HiringCafeRawJob): CreateJobInput | null {
  const jobInformation = asRecord(raw.job_information);
  const processed = asRecord(raw.v5_processed_job_data);
  const companyInfo = asRecord(jobInformation?.company_info);
  const enrichedCompanyData = asRecord(raw.enriched_company_data);

  const sourceJobId = getHiringCafeSourceJobId(raw);

  const jobUrl = toStringOrNull(raw.apply_url);
  if (!jobUrl) return null;

  const title =
    toStringOrNull(jobInformation?.title) ??
    toStringOrNull(jobInformation?.job_title_raw) ??
    toStringOrNull(processed?.core_job_title) ??
    "Unknown Title";

  const employer =
    toStringOrNull(companyInfo?.name) ??
    toStringOrNull(processed?.company_name) ??
    "Unknown Employer";

  const location =
    toStringOrNull(processed?.formatted_workplace_location) ??
    firstArrayValue(processed?.workplace_cities) ??
    firstArrayValue(processed?.workplace_states) ??
    firstArrayValue(processed?.workplace_countries) ??
    undefined;
  const locationEvidence = buildLocationEvidence({
    formattedLocation: toStringOrNull(processed?.formatted_workplace_location),
    cities: asStringArray(processed?.workplace_cities),
    states: asStringArray(processed?.workplace_states),
    countries: asStringArray(processed?.workplace_countries),
  });

  const commitments = asStringArray(processed?.commitment);
  const jobType = commitments.length > 0 ? commitments.join(", ") : undefined;
  const skills = asStringArray(processed?.technical_tools);
  const workplaceType = toStringOrNull(processed?.workplace_type);

  return {
    source: "hiringcafe",
    sourceJobId,
    title,
    employer,
    employerUrl:
      toStringOrNull(enrichedCompanyData?.homepage_uri) ??
      toStringOrNull(processed?.company_website) ??
      undefined,
    jobUrl,
    applicationLink: jobUrl,
    location,
    locationEvidence,
    salary: formatCompensation(processed),
    datePosted: toStringOrNull(processed?.estimated_publish_date) ?? undefined,
    jobDescription:
      toStringOrNull(jobInformation?.description) ??
      toStringOrNull(processed?.requirements_summary) ??
      undefined,
    jobType,
    skills: skills.length > 0 ? skills.join(", ") : undefined,
    isRemote: workplaceType === "Remote",
  };
}

function parseRawJobs(value: unknown): HiringCafeRawJob[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is HiringCafeRawJob =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function parseNextData(html: string, challengeUrl = BASE_URL): unknown {
  const match = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>\s*([\s\S]*?)\s*<\/script>/i,
  );
  if (!match) {
    if (CHALLENGE_BODY_PATTERN.test(html)) {
      throw new HiringCafeChallengeError(challengeUrl);
    }
    throw new Error(
      "Hiring Cafe response did not include Next.js search data.",
    );
  }

  try {
    return JSON.parse(match[1] ?? "");
  } catch {
    throw new Error("Hiring Cafe Next.js search data was not valid JSON.");
  }
}

function isExpiredHiringCafeJobPage(html: string): boolean {
  return /<title[^>]*>\s*HiringCafe\s*-\s*Expired Job\s*<\/title>/i.test(html);
}

export function parseHiringCafeSsrPage(html: string): HiringCafeSsrPage {
  const data = parseNextData(html);

  const props = asRecord(asRecord(data)?.props);
  const pageProps = asRecord(props?.pageProps);
  if (!pageProps) {
    throw new Error("Hiring Cafe Next.js search data was missing page props.");
  }

  const ssrError = pageProps.ssrError;
  if (ssrError) {
    throw new Error(`Hiring Cafe SSR search failed: ${String(ssrError)}`);
  }

  return {
    jobs: parseRawJobs(pageProps.ssrHits),
    page: toNumberOrNull(pageProps.ssrPage) ?? 0,
    totalCount: toNumberOrNull(pageProps.ssrTotalCount),
    pageSize: toNumberOrNull(pageProps.ssrPageSize),
    isLastPage: Boolean(pageProps.ssrIsLastPage),
  };
}

export function parseHiringCafeJobDetailPage(
  html: string,
  challengeUrl = BASE_URL,
  status?: number,
): HiringCafeRawJob | null {
  if (isExpiredHiringCafeJobPage(html)) return null;

  let data: unknown;
  try {
    data = parseNextData(html, challengeUrl);
  } catch (error) {
    if (error instanceof HiringCafeChallengeError) {
      throw new HiringCafeChallengeError(challengeUrl, status);
    }
    throw error;
  }

  const props = asRecord(asRecord(data)?.props);
  const pageProps = asRecord(props?.pageProps);
  if (!pageProps) {
    throw new Error("Hiring Cafe job detail data was missing page props.");
  }

  const job = asRecord(pageProps.job);
  return job ? (job as HiringCafeRawJob) : null;
}

export function buildHiringCafeSearchUrl(args: {
  searchState: unknown;
  pageNo: number;
}): string {
  const url = new URL(BASE_URL);
  url.searchParams.set("searchState", JSON.stringify(args.searchState));
  if (args.pageNo > 0) {
    url.searchParams.set("page", String(args.pageNo));
  }
  return url.toString();
}

async function fetchHiringCafeSearchPage(args: {
  searchState: unknown;
  pageNo: number;
  fetchImpl: typeof fetch;
}): Promise<HiringCafeSsrPage> {
  const url = buildHiringCafeSearchUrl({
    searchState: args.searchState,
    pageNo: args.pageNo,
  });
  const response = await args.fetchImpl(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20_000),
  });

  const body = await response.text();
  if (!response.ok) {
    if (CHALLENGE_BODY_PATTERN.test(body)) {
      throw new HiringCafeChallengeError(url, response.status);
    }
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(
      `Hiring Cafe search request failed with ${response.status}${statusText} for ${url}`,
    );
  }

  try {
    return parseHiringCafeSsrPage(body);
  } catch (error) {
    if (error instanceof HiringCafeChallengeError) {
      throw new HiringCafeChallengeError(url, error.status);
    }
    throw error;
  }
}

async function fetchHiringCafeJobDetail(args: {
  requisitionId: string;
  fetchImpl: typeof fetch;
}): Promise<HiringCafeRawJob | null> {
  const url = new URL(
    encodeURIComponent(args.requisitionId),
    JOB_DETAIL_BASE_URL,
  );
  const response = await args.fetchImpl(url.toString(), {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
    signal: AbortSignal.timeout(20_000),
  });

  const body = await response.text();
  if (!response.ok) {
    if (CHALLENGE_BODY_PATTERN.test(body)) {
      throw new HiringCafeChallengeError(url.toString(), response.status);
    }
    return null;
  }

  try {
    return parseHiringCafeJobDetailPage(body, url.toString(), response.status);
  } catch (error) {
    if (error instanceof HiringCafeChallengeError) throw error;
    return null;
  }
}

async function enrichHiringCafeJobWithDetail(args: {
  rawJob: HiringCafeRawJob;
  fetchImpl: typeof fetch;
}): Promise<HiringCafeRawJob> {
  if (hasJobDescription(args.rawJob)) return args.rawJob;

  const requisitionId = getHiringCafeRequisitionId(args.rawJob);
  if (!requisitionId) return args.rawJob;

  const detailJob = await fetchHiringCafeJobDetail({
    requisitionId,
    fetchImpl: args.fetchImpl,
  });

  return detailJob ?? args.rawJob;
}

function buildCityLocationId(input: string): string {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, "_");
  return `city_${normalized}`.slice(0, 32);
}

function toRegionShortName(value: string): string {
  const compact = value
    .replace(/[^a-zA-Z\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (compact.length === 0) return "REG";
  if (compact.length === 1) {
    return compact[0].slice(0, 3).toUpperCase();
  }
  return compact
    .slice(0, 3)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

async function resolveCityLocationContext(args: {
  city: string;
  countryLong: string;
  countryShort: string;
  radiusMiles: number;
  fetchImpl: typeof fetch;
}): Promise<CityLocationContext | null> {
  if (!args.countryLong || !args.countryShort) return null;

  const query = `${args.city}, ${args.countryLong}`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");

  try {
    const response = await args.fetchImpl(url.toString(), {
      headers: {
        accept: "application/json",
        "user-agent": "job-ops-hiringcafe-extractor/1.0",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;

    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload) || payload.length === 0) return null;

    const first = payload[0] as NominatimResult;
    const lat = Number(first.lat ?? "");
    const lon = Number(first.lon ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    const address = asRecord(first.address);
    const regionLong =
      toStringOrNull(address?.state) ??
      toStringOrNull(address?.county) ??
      toStringOrNull(address?.region) ??
      args.countryLong;
    const displayName =
      toStringOrNull(first.display_name) ??
      `${args.city}, ${regionLong}, ${args.countryShort}`;

    return {
      id: buildCityLocationId(args.city),
      city: args.city,
      regionLong,
      regionShort: toRegionShortName(regionLong),
      countryLong: args.countryLong,
      countryShort: args.countryShort,
      lat,
      lon,
      formattedAddress: displayName,
      population: null,
      radiusMiles: args.radiusMiles,
    };
  } catch {
    return null;
  }
}

function createCitySearchState(args: {
  searchQuery: string;
  dateFetchedPastNDays: number;
  context: CityLocationContext;
  workplaceTypes: HiringCafeWorkplaceType[];
}): Record<string, unknown> {
  return {
    searchQuery: args.searchQuery,
    locations: [
      {
        id: args.context.id,
        types: ["locality"],
        address_components: [
          {
            long_name: args.context.city,
            short_name: args.context.city,
            types: ["locality"],
          },
          {
            long_name: args.context.regionLong,
            short_name: args.context.regionShort,
            types: ["administrative_area_level_1"],
          },
          {
            long_name: args.context.countryLong,
            short_name: args.context.countryShort,
            types: ["country"],
          },
        ],
        geometry: {
          location: {
            lat: args.context.lat,
            lon: args.context.lon,
          },
        },
        formatted_address: args.context.formattedAddress,
        population: args.context.population,
        workplace_types: [],
        options: {
          radius: args.context.radiusMiles,
          radius_unit: "miles",
          ignore_radius: false,
        },
      },
    ],
    workplaceTypes: args.workplaceTypes,
    defaultToUserLocation: false,
    userLocation: null,
    dateFetchedPastNDays: args.dateFetchedPastNDays,
  };
}

async function resolveSearchStateLocation(args: {
  location: string | null;
  countryLocation: HiringCafeCountryLocation | null;
  countryKey: string;
  radiusMiles: number;
  fetchImpl: typeof fetch;
  proximity?: LocationProximity;
}): Promise<CityLocationContext | null> {
  if (!args.countryLocation) return null;
  if (args.proximity) {
    const city = args.location ?? "Selected map area";
    const countryComponent = args.countryLocation.address_components[0];
    const countryLong = countryComponent?.long_name ?? "";
    return {
      id: buildCityLocationId(city),
      city,
      regionLong: countryLong,
      regionShort: countryComponent?.short_name ?? "",
      countryLong,
      countryShort: countryComponent?.short_name ?? "",
      lat: args.proximity.latitude,
      lon: args.proximity.longitude,
      formattedAddress: city,
      population: null,
      radiusMiles: args.proximity.radiusMiles,
    };
  }
  if (!args.location) return null;
  if (!shouldApplyStrictCityFilter(args.location, args.countryKey)) return null;

  const countryComponent = args.countryLocation.address_components[0];
  return resolveCityLocationContext({
    city: args.location,
    countryLong: countryComponent?.long_name ?? "",
    countryShort: countryComponent?.short_name ?? "",
    radiusMiles: args.radiusMiles,
    fetchImpl: args.fetchImpl,
  });
}

async function buildSearchState(args: {
  searchTerm: string;
  countryLocation: HiringCafeCountryLocation | null;
  cityLocationContext: CityLocationContext | null;
  workplaceTypes: HiringCafeWorkplaceType[];
}): Promise<unknown> {
  if (args.cityLocationContext) {
    return createCitySearchState({
      searchQuery: args.searchTerm,
      dateFetchedPastNDays: DEFAULT_DATE_FETCHED_PAST_N_DAYS,
      context: args.cityLocationContext,
      workplaceTypes: args.workplaceTypes,
    });
  }

  return createDefaultSearchState({
    searchQuery: args.searchTerm,
    location: args.countryLocation,
    dateFetchedPastNDays: DEFAULT_DATE_FETCHED_PAST_N_DAYS,
    workplaceTypes: args.workplaceTypes,
  });
}

export async function runHiringCafe(
  options: RunHiringCafeOptions = {},
): Promise<HiringCafeResult> {
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : [DEFAULT_SEARCH_TERM];
  const country = (options.country ?? "").trim().toLowerCase();
  const countryKey = normalizeCountryKey(options.countryKey ?? country);
  const maxJobsPerTerm = toPositiveIntOrFallback(
    options.maxJobsPerTerm,
    DEFAULT_MAX_JOBS_PER_TERM,
  );
  const locationRadiusMiles = toPositiveIntOrFallback(
    options.locationRadiusMiles,
    DEFAULT_LOCATION_RADIUS_MILES,
  );
  const locations = resolveSearchCities({
    list: options.locations,
    env: process.env.HIRING_CAFE_LOCATION_QUERY,
  });
  const runLocations = options.proximity
    ? [locations[0] ?? null]
    : locations.length > 0
      ? locations
      : [null];
  const termTotal = searchTerms.length * runLocations.length;
  const workplaceTypes = parseWorkplaceTypes(options.workplaceTypes);
  const jobs: CreateJobInput[] = [];
  const seen = new Set(options.searchResume?.seenKeys ?? []);
  const sourceErrors: string[] = [];
  const skippedSearchStates = new Set(
    options.skippedChallengeSearchStates ?? [],
  );
  let skipDetailEnrichment = Boolean(
    options.searchResume?.pendingDetailChallengeUrl,
  );
  let detailChallengeUrl = options.searchResume?.pendingDetailChallengeUrl;
  let activeSearchResume: HiringCafeSearchResume | undefined;

  const successfulResult = (): HiringCafeResult => ({
    success: true,
    jobs,
    ...(sourceErrors.length > 0 ? { sourceErrors } : {}),
    ...(detailChallengeUrl ? { challengeRequired: detailChallengeUrl } : {}),
  });

  try {
    const resume = options.searchResume;
    if (
      resume &&
      (!Number.isInteger(resume.locationIndex) ||
        resume.locationIndex < 0 ||
        resume.locationIndex >= runLocations.length ||
        !Number.isInteger(resume.termIndex) ||
        resume.termIndex < 0 ||
        resume.termIndex >= searchTerms.length ||
        !Number.isInteger(resume.pageNo) ||
        resume.pageNo < 0 ||
        resume.pageNo >= PAGE_LIMIT ||
        !Number.isInteger(resume.termCollected) ||
        resume.termCollected < 0 ||
        resume.termCollected >= maxJobsPerTerm ||
        runLocations[resume.locationIndex] !== resume.location ||
        searchTerms[resume.termIndex] !== resume.searchTerm)
    ) {
      throw new Error(
        "Hiring Cafe search checkpoint no longer matches this run",
      );
    }
    const rawFetch = options.pageReader
      ? ((async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = typeof input === "string" ? input : input.toString();
          if (new URL(url).origin !== new URL(BASE_URL).origin) {
            return (options.fetchImpl ?? fetch)(input, init);
          }
          const page = await options.pageReader?.read(url);
          if (!page)
            throw new Error("Hiring Cafe browser page was unavailable");
          if (page.challenged) {
            throw new HiringCafeChallengeError(url, page.status);
          }
          return new Response(page.html, { status: page.status || 502 });
        }) as typeof fetch)
      : options.fetchImpl;
    if (!rawFetch) {
      throw new Error("Hiring Cafe requires a Firefox page reader");
    }
    const fetchImpl =
      options.fetchImpl && !options.pageReader
        ? rawFetch
        : withThrottleAndRetry(rawFetch);
    const countryLocation = resolveHiringCafeCountryLocation(country);
    let retryRequisitionId: string | undefined;
    let retriedDetailJob: HiringCafeRawJob | null = null;

    if (options.retryChallengeUrl) {
      const retryUrl = new URL(options.retryChallengeUrl);
      if (
        retryUrl.origin === new URL(BASE_URL).origin &&
        /^\/job\/[^/]+$/.test(retryUrl.pathname)
      ) {
        retryRequisitionId = decodeURIComponent(
          retryUrl.pathname.slice("/job/".length),
        );
        retriedDetailJob = await fetchHiringCafeJobDetail({
          requisitionId: retryRequisitionId,
          fetchImpl,
        });
      }
    }
    let retriedDetailApplied = false;

    // A detail challenge is reported only after the search terms have finished.
    // The pipeline already holds their jobs; this retry only needs the detail.
    if (retryRequisitionId && !options.searchResume) {
      const mapped = retriedDetailJob
        ? mapHiringCafeJob(retriedDetailJob)
        : null;
      if (mapped) jobs.push(mapped);
      return successfulResult();
    }

    for (let runIndex = 0; runIndex < runLocations.length; runIndex += 1) {
      if (options.shouldCancel?.()) return successfulResult();

      if (
        options.searchResume &&
        runIndex < options.searchResume.locationIndex
      ) {
        continue;
      }

      const runLocation = runLocations[runIndex];
      const cityLocationContext = await resolveSearchStateLocation({
        location: runLocation,
        countryLocation,
        countryKey,
        radiusMiles: locationRadiusMiles,
        fetchImpl,
        proximity: options.proximity,
      });

      for (let i = 0; i < searchTerms.length; i += 1) {
        if (options.shouldCancel?.()) return successfulResult();

        if (
          options.searchResume &&
          runIndex === options.searchResume.locationIndex &&
          i < options.searchResume.termIndex
        ) {
          continue;
        }

        const searchTerm = searchTerms[i];
        const termIndex = runIndex * searchTerms.length + i + 1;
        options.onProgress?.({
          type: "term_start",
          termIndex,
          termTotal,
          searchTerm,
        });

        const resumingHere =
          options.searchResume?.locationIndex === runIndex &&
          options.searchResume.termIndex === i;
        if (
          resumingHere &&
          (options.searchResume?.searchTerm !== searchTerm ||
            options.searchResume.location !== runLocation)
        ) {
          throw new Error(
            "Hiring Cafe search settings changed during a challenge",
          );
        }
        const searchState = resumingHere
          ? JSON.parse(options.searchResume?.searchState ?? "null")
          : await buildSearchState({
              searchTerm,
              countryLocation,
              cityLocationContext,
              workplaceTypes,
            });
        if (skippedSearchStates.has(JSON.stringify(searchState))) {
          options.onProgress?.({
            type: "term_complete",
            termIndex,
            termTotal,
            searchTerm,
            jobsFoundTerm: 0,
          });
          continue;
        }
        let pageNo = resumingHere ? (options.searchResume?.pageNo ?? 0) : 0;
        let termCollected = resumingHere
          ? (options.searchResume?.termCollected ?? 0)
          : 0;

        while (termCollected < maxJobsPerTerm && pageNo < PAGE_LIMIT) {
          if (options.shouldCancel?.()) return successfulResult();

          activeSearchResume = {
            locationIndex: runIndex,
            termIndex: i,
            location: runLocation,
            searchTerm,
            pageNo,
            termCollected,
            searchState: JSON.stringify(searchState),
            seenKeys: Array.from(seen),
            ...(detailChallengeUrl
              ? { pendingDetailChallengeUrl: detailChallengeUrl }
              : {}),
          };
          const page = await fetchHiringCafeSearchPage({
            searchState,
            pageNo,
            fetchImpl,
          });
          activeSearchResume = undefined;
          let mappedOnPage = 0;

          for (const rawJob of page.jobs) {
            if (termCollected >= maxJobsPerTerm) break;

            const dedupeKey = getHiringCafeDedupeKey(rawJob);
            if (dedupeKey && seen.has(dedupeKey)) continue;

            let enrichedRawJob = rawJob;
            if (
              retriedDetailJob &&
              getHiringCafeRequisitionId(rawJob) === retryRequisitionId
            ) {
              enrichedRawJob = retriedDetailJob;
              retriedDetailApplied = true;
            } else if (!skipDetailEnrichment) {
              try {
                enrichedRawJob = await enrichHiringCafeJobWithDetail({
                  rawJob,
                  fetchImpl,
                });
              } catch (error) {
                if (!(error instanceof HiringCafeChallengeError)) throw error;
                skipDetailEnrichment = true;
                detailChallengeUrl = error.challengeUrl;
                const status = error.status ? ` (HTTP ${error.status})` : "";
                sourceErrors.push(
                  `Hiring Cafe job detail request was challenged${status}; waiting for a solve before retrying detail pages.`,
                );
              }
            }
            const mapped = mapHiringCafeJob(enrichedRawJob);
            if (!mapped) continue;

            const finalDedupeKey =
              dedupeKey ?? mapped.sourceJobId ?? mapped.jobUrl;
            if (seen.has(finalDedupeKey)) continue;
            seen.add(finalDedupeKey);
            jobs.push(mapped);
            termCollected += 1;
            mappedOnPage += 1;
          }

          options.onProgress?.({
            type: "page_fetched",
            termIndex,
            termTotal,
            searchTerm,
            pageNo,
            resultsOnPage: mappedOnPage,
            totalCollected: termCollected,
          });

          if (page.isLastPage || page.jobs.length === 0) break;
          pageNo += 1;
        }

        options.onProgress?.({
          type: "term_complete",
          termIndex,
          termTotal,
          searchTerm,
          jobsFoundTerm: termCollected,
        });
      }
    }

    // The listing can move out of the current search results between the
    // paused run and its retry. Keep the successfully retried detail in that
    // case so the original partial job can still be enriched before import.
    if (retriedDetailJob && !retriedDetailApplied) {
      const mapped = mapHiringCafeJob(retriedDetailJob);
      if (
        mapped &&
        !jobs.some(
          (job) =>
            job.source === mapped.source &&
            (job.sourceJobId === mapped.sourceJobId ||
              job.jobUrl === mapped.jobUrl),
        )
      ) {
        jobs.push(mapped);
      }
    }

    return successfulResult();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (error instanceof HiringCafeChallengeError) {
      const status = error.status ? ` (HTTP ${error.status})` : "";
      return {
        success: true,
        jobs,
        sourceErrors: [
          ...sourceErrors,
          `Hiring Cafe search request was challenged${status}; waiting for a solve before continuing.`,
        ],
        challengeRequired: error.challengeUrl,
        ...(activeSearchResume ? { searchResume: activeSearchResume } : {}),
      };
    }
    return {
      success: false,
      jobs: [],
      error: message,
    };
  }
}
