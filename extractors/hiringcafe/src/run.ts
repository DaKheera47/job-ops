import { normalizeCountryKey } from "@shared/location-support.js";
import {
  resolveSearchCities,
  shouldApplyStrictCityFilter,
} from "@shared/search-cities.js";
import type { CreateJobInput, JobLocationEvidence } from "@shared/types/jobs";
import {
  toNumberOrNull,
  toStringOrNull,
} from "@shared/utils/type-conversion.js";
import {
  type HiringCafeCountryLocation,
  resolveHiringCafeCountryLocation,
} from "./country-map.js";
import { createDefaultSearchState } from "./default-search-state.js";

const BASE_URL = "https://hiring.cafe/";
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
  maxJobsPerTerm?: number;
  fetchImpl?: typeof fetch;
  shouldCancel?: () => boolean;
  onProgress?: (event: HiringCafeProgressEvent) => void;
}

export interface HiringCafeResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
  /** URL that needs a human to solve a Cloudflare challenge in a headed browser */
  challengeRequired?: string;
}

class HiringCafeChallengeError extends Error {
  constructor() {
    super("Hiring Cafe returned a challenge page instead of search data.");
    this.name = "HiringCafeChallengeError";
  }
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

function mapHiringCafeJob(raw: HiringCafeRawJob): CreateJobInput | null {
  const jobInformation = asRecord(raw.job_information);
  const processed = asRecord(raw.v5_processed_job_data);
  const companyInfo = asRecord(jobInformation?.company_info);
  const enrichedCompanyData = asRecord(raw.enriched_company_data);

  const sourceJobId =
    toStringOrNull(raw.id) ??
    toStringOrNull(raw.objectID) ??
    toStringOrNull(raw.original_source_id) ??
    toStringOrNull(raw.requisition_id) ??
    undefined;

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

export function parseHiringCafeSsrPage(html: string): HiringCafeSsrPage {
  const match = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>\s*([\s\S]*?)\s*<\/script>/i,
  );
  if (!match) {
    if (/cloudflare|cf-browser-verification|challenge-platform/i.test(html)) {
      throw new HiringCafeChallengeError();
    }
    throw new Error(
      "Hiring Cafe response did not include Next.js search data.",
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(match[1] ?? "");
  } catch {
    throw new Error("Hiring Cafe Next.js search data was not valid JSON.");
  }

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
      "user-agent": "Mozilla/5.0 (compatible; JobOps/1.0)",
    },
    signal: AbortSignal.timeout(20_000),
  });

  const body = await response.text();
  if (!response.ok) {
    if (/cloudflare|cf-browser-verification|challenge-platform/i.test(body)) {
      throw new HiringCafeChallengeError();
    }
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(
      `Hiring Cafe search request failed with ${response.status}${statusText} for ${url}`,
    );
  }

  return parseHiringCafeSsrPage(body);
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
}): Promise<CityLocationContext | null> {
  if (!args.location || !args.countryLocation) return null;
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
  const runLocations = locations.length > 0 ? locations : [null];
  const termTotal = searchTerms.length * runLocations.length;
  const workplaceTypes = parseWorkplaceTypes(options.workplaceTypes);
  const fetchImpl = options.fetchImpl ?? fetch;
  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();

  try {
    const countryLocation = resolveHiringCafeCountryLocation(country);

    for (let runIndex = 0; runIndex < runLocations.length; runIndex += 1) {
      if (options.shouldCancel?.()) return { success: true, jobs };

      const runLocation = runLocations[runIndex];
      const cityLocationContext = await resolveSearchStateLocation({
        location: runLocation,
        countryLocation,
        countryKey,
        radiusMiles: locationRadiusMiles,
        fetchImpl,
      });

      for (let i = 0; i < searchTerms.length; i += 1) {
        if (options.shouldCancel?.()) return { success: true, jobs };

        const searchTerm = searchTerms[i];
        const termIndex = runIndex * searchTerms.length + i + 1;
        options.onProgress?.({
          type: "term_start",
          termIndex,
          termTotal,
          searchTerm,
        });

        const searchState = await buildSearchState({
          searchTerm,
          countryLocation,
          cityLocationContext,
          workplaceTypes,
        });
        let pageNo = 0;
        let termCollected = 0;

        while (termCollected < maxJobsPerTerm && pageNo < PAGE_LIMIT) {
          if (options.shouldCancel?.()) return { success: true, jobs };

          const page = await fetchHiringCafeSearchPage({
            searchState,
            pageNo,
            fetchImpl,
          });
          let mappedOnPage = 0;

          for (const rawJob of page.jobs) {
            if (termCollected >= maxJobsPerTerm) break;

            const mapped = mapHiringCafeJob(rawJob);
            if (!mapped) continue;

            const dedupeKey = mapped.sourceJobId || mapped.jobUrl;
            if (seen.has(dedupeKey)) continue;
            seen.add(dedupeKey);
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

    return { success: true, jobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      jobs: [],
      error: message,
      challengeRequired:
        error instanceof HiringCafeChallengeError ? BASE_URL : undefined,
    };
  }
}
