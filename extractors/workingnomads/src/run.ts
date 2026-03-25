import { normalizeCountryKey } from "@shared/location-support.js";
import {
  matchesRequestedCity,
  normalizeLocationToken,
  resolveSearchCities,
} from "@shared/search-cities.js";
import type { CreateJobInput } from "@shared/types/jobs";

const WORKING_NOMADS_SEARCH_URL =
  "https://www.workingnomads.com/jobsapi/_search";
const WORKING_NOMADS_MAX_SEARCH_PAGE_SIZE = 100;

export type WorkingNomadsWorkplaceType = "remote" | "hybrid" | "onsite";

export type WorkingNomadsProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export interface RunWorkingNomadsOptions {
  searchTerms?: string[];
  selectedCountry?: string;
  locations?: string[];
  workplaceTypes?: WorkingNomadsWorkplaceType[];
  maxJobsPerTerm?: number;
  onProgress?: (event: WorkingNomadsProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface WorkingNomadsResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

interface WorkingNomadsSearchJob {
  id?: unknown;
  slug?: unknown;
  url?: unknown;
  title?: unknown;
  description?: unknown;
  company?: unknown;
  company_name?: unknown;
  category_name?: unknown;
  tags?: unknown;
  locations?: unknown;
  location?: unknown;
  location_base?: unknown;
  pub_date?: unknown;
  apply_url?: unknown;
  position_type?: unknown;
}

interface WorkingNomadsSearchHit {
  _source?: WorkingNomadsSearchJob;
}

interface WorkingNomadsSearchResponse {
  hits?: {
    hits?: WorkingNomadsSearchHit[];
  };
}

function toPositiveIntOrFallback(
  value: number | string | undefined,
  fallback: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function inferJobType(text: string, positionType: string | undefined): string {
  switch (positionType) {
    case "ft":
      return "Full-time";
    case "pt":
      return "Part-time";
    case "fr":
      return "Contract";
    default:
      break;
  }

  const patterns: Array<[RegExp, string]> = [
    [/\bpart[\s-]?time\b/i, "Part-time"],
    [/\bfull[\s-]?time\b/i, "Full-time"],
    [/\bcontract(or)?\b/i, "Contract"],
    [/\bfreelance\b/i, "Freelance"],
    [/\bintern(ship)?\b/i, "Internship"],
    [/\btemporary\b/i, "Temporary"],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) return label;
  }

  return "Full-time";
}

function escapeQueryString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildQueryString(searchTerm: string): string {
  const trimmed = searchTerm.trim();
  if (!trimmed) return "";

  if (/\s+AND\s+/i.test(trimmed)) {
    return trimmed
      .split(/\s+AND\s+/i)
      .map((part) => `"${escapeQueryString(part.trim())}"`)
      .join(" AND ");
  }

  return `"${escapeQueryString(trimmed)}"`;
}

function matchesSearchTerm(
  job: WorkingNomadsSearchJob,
  searchTerm: string,
): boolean {
  const normalizedTerm = searchTerm
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalizedTerm) return true;

  const tags = Array.isArray(job.tags)
    ? job.tags.filter((value): value is string => typeof value === "string")
    : typeof job.tags === "string"
      ? job.tags
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
  const locations = Array.isArray(job.locations)
    ? job.locations.filter(
        (value): value is string => typeof value === "string",
      )
    : typeof job.location === "string"
      ? [job.location]
      : [];
  const haystack = [
    typeof job.title === "string" ? job.title : "",
    typeof job.description === "string" ? job.description : "",
    typeof job.company === "string"
      ? job.company
      : typeof job.company_name === "string"
        ? job.company_name
        : "",
    typeof job.category_name === "string" ? job.category_name : "",
    ...tags,
    ...locations,
    typeof job.location_base === "string" ? job.location_base : "",
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!haystack) return false;
  if (haystack.includes(normalizedTerm)) return true;

  return normalizedTerm
    .split(" ")
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function isCountryLikeLocation(
  requestedLocation: string,
  selectedCountry: string | undefined,
): boolean {
  const normalizedRequested = normalizeLocationToken(requestedLocation);
  const normalizedCountry = normalizeCountryKey(selectedCountry);
  if (!normalizedRequested || !normalizedCountry) return false;
  return normalizedRequested === normalizedCountry;
}

function resolveExplicitLocations(
  locations: string[] | undefined,
  selectedCountry: string | undefined,
): string[] {
  return resolveSearchCities({ list: locations }).filter(
    (location) => !isCountryLikeLocation(location, selectedCountry),
  );
}

const EUROPE_COUNTRIES = new Set([
  "albania",
  "andorra",
  "austria",
  "belgium",
  "bosnia and herzegovina",
  "bulgaria",
  "croatia",
  "cyprus",
  "czechia",
  "czech republic",
  "denmark",
  "estonia",
  "finland",
  "france",
  "germany",
  "greece",
  "hungary",
  "iceland",
  "ireland",
  "italy",
  "latvia",
  "liechtenstein",
  "lithuania",
  "luxembourg",
  "malta",
  "moldova",
  "monaco",
  "montenegro",
  "netherlands",
  "north macedonia",
  "norway",
  "poland",
  "portugal",
  "romania",
  "san marino",
  "slovakia",
  "slovenia",
  "spain",
  "sweden",
  "switzerland",
  "ukraine",
  "united kingdom",
  "uk",
  "vatican city",
]);

const APAC_COUNTRIES = new Set([
  "australia",
  "bangladesh",
  "china",
  "hong kong",
  "india",
  "indonesia",
  "japan",
  "malaysia",
  "new zealand",
  "pakistan",
  "philippines",
  "singapore",
  "south korea",
  "taiwan",
  "thailand",
  "vietnam",
]);

const AFRICA_COUNTRIES = new Set([
  "algeria",
  "angola",
  "benin",
  "botswana",
  "egypt",
  "morocco",
  "nigeria",
  "south africa",
]);

const MIDDLE_EAST_COUNTRIES = new Set([
  "bahrain",
  "israel",
  "kuwait",
  "oman",
  "qatar",
  "saudi arabia",
  "turkey",
  "turkiye",
  "united arab emirates",
]);

const LATIN_AMERICA_COUNTRIES = new Set([
  "argentina",
  "belize",
  "bolivia",
  "brazil",
  "chile",
  "colombia",
  "costa rica",
  "ecuador",
  "el salvador",
  "guatemala",
  "honduras",
  "jamaica",
  "mexico",
  "panama",
  "paraguay",
  "peru",
  "puerto rico",
  "uruguay",
  "venezuela",
]);

function getCountrySearchTokens(country: string | undefined): string[] {
  const normalizedCountry = normalizeCountryKey(country);
  if (!normalizedCountry || normalizedCountry === "worldwide") {
    return [];
  }

  if (normalizedCountry === "usa/ca") {
    return ["USA", "Canada", "North America", "Anywhere"];
  }

  if (normalizedCountry === "united states" || normalizedCountry === "usa") {
    return ["USA", "North America", "Anywhere"];
  }

  if (normalizedCountry === "canada") {
    return ["Canada", "North America", "Anywhere"];
  }

  if (normalizedCountry === "united kingdom" || normalizedCountry === "uk") {
    return ["UK", "Europe", "EMEA", "Anywhere"];
  }

  const tokens = new Set<string>(["Anywhere"]);

  if (EUROPE_COUNTRIES.has(normalizedCountry)) {
    tokens.add("Europe");
    tokens.add("EMEA");
  }
  if (APAC_COUNTRIES.has(normalizedCountry)) {
    tokens.add("Asia");
    tokens.add("APAC");
  }
  if (AFRICA_COUNTRIES.has(normalizedCountry)) {
    tokens.add("Africa");
    tokens.add("EMEA");
  }
  if (MIDDLE_EAST_COUNTRIES.has(normalizedCountry)) {
    tokens.add("Middle East");
    tokens.add("EMEA");
  }
  if (LATIN_AMERICA_COUNTRIES.has(normalizedCountry)) {
    tokens.add("Latin America");
  }

  const countryToken =
    normalizedCountry === "united states"
      ? "USA"
      : normalizedCountry
          .replace(/\b\w/g, (char) => char.toUpperCase())
          .replace("Czech Republic", "Czechia");
  tokens.add(countryToken);

  return [...tokens];
}

function matchesRequestedLocation(
  jobLocation: string | undefined,
  requestedLocation: string,
): boolean {
  if (!jobLocation) return false;
  if (matchesRequestedCity(jobLocation, requestedLocation)) return true;

  const normalizedJobLocation = normalizeLocationToken(jobLocation);
  const normalizedRequestedLocation = normalizeLocationToken(requestedLocation);
  if (!normalizedJobLocation || !normalizedRequestedLocation) return false;

  return normalizedJobLocation.includes(normalizedRequestedLocation);
}

function buildSearchRequest(args: {
  searchTerm: string;
  locationTokens: string[];
  maxJobsPerTerm: number;
}): Record<string, unknown> {
  const request: Record<string, unknown> = {
    size: Math.min(
      Math.max(args.maxJobsPerTerm, 50),
      WORKING_NOMADS_MAX_SEARCH_PAGE_SIZE,
    ),
    _source: [
      "id",
      "slug",
      "title",
      "company",
      "category_name",
      "description",
      "position_type",
      "tags",
      "locations",
      "location_base",
      "pub_date",
      "apply_url",
    ],
    sort: [{ premium: { order: "desc" } }, { pub_date: { order: "desc" } }],
  };

  const filters: Array<Record<string, unknown>> = [];
  if (args.locationTokens.length > 0) {
    filters.push({ terms: { locations: args.locationTokens } });
  }

  const queryString = buildQueryString(args.searchTerm);
  if (!queryString && filters.length === 0) {
    return request;
  }

  const boolQuery: Record<string, unknown> = {};
  if (queryString) {
    boolQuery.must = [
      {
        query_string: {
          query: queryString,
          fields: ["title^2", "description", "company"],
        },
      },
    ];
    request.min_score = 2;
  }
  if (filters.length > 0) {
    boolQuery.filter = filters;
  }

  request.query = { bool: boolQuery };
  return request;
}

async function fetchWorkingNomadsJobs(args: {
  fetchImpl: typeof fetch;
  searchTerm: string;
  locationTokens: string[];
  maxJobsPerTerm: number;
}): Promise<WorkingNomadsSearchJob[]> {
  const response = await args.fetchImpl(WORKING_NOMADS_SEARCH_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(
      buildSearchRequest({
        searchTerm: args.searchTerm,
        locationTokens: args.locationTokens,
        maxJobsPerTerm: args.maxJobsPerTerm,
      }),
    ),
  });

  if (!response.ok) {
    throw new Error(
      `Working Nomads search request failed with ${response.status}`,
    );
  }

  const payload = (await response.json()) as
    | WorkingNomadsSearchResponse
    | WorkingNomadsSearchJob[];
  if (Array.isArray(payload)) {
    return payload;
  }

  const hits = payload.hits?.hits;
  if (!Array.isArray(hits)) {
    throw new Error("Working Nomads search returned an unexpected payload.");
  }

  return hits
    .map((hit) => hit._source)
    .filter((job): job is WorkingNomadsSearchJob => Boolean(job));
}

function mapWorkingNomadsJob(
  job: WorkingNomadsSearchJob,
): CreateJobInput | null {
  const sourceJobId =
    typeof job.id === "number"
      ? String(job.id)
      : typeof job.id === "string"
        ? job.id
        : undefined;
  const slug = typeof job.slug === "string" ? job.slug : undefined;
  const legacyUrl = typeof job.url === "string" ? job.url : undefined;
  const jobUrl = slug
    ? `https://www.workingnomads.com/jobs/${slug}`
    : sourceJobId
      ? `https://www.workingnomads.com/job/go/${sourceJobId}/`
      : (legacyUrl ?? null);
  if (!jobUrl) return null;

  const description =
    typeof job.description === "string" ? job.description : undefined;
  const title = typeof job.title === "string" ? job.title : "Unknown Title";
  const locationBase =
    typeof job.location_base === "string" ? job.location_base : undefined;
  const locations = Array.isArray(job.locations)
    ? job.locations.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const legacyLocation =
    typeof job.location === "string" ? job.location : undefined;
  const location =
    locationBase ??
    legacyLocation ??
    (locations.length > 0 ? locations.join(", ") : "Remote");
  const category =
    typeof job.category_name === "string" ? job.category_name : undefined;
  const tags = Array.isArray(job.tags)
    ? job.tags.filter((value): value is string => typeof value === "string")
    : typeof job.tags === "string"
      ? job.tags
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
  const positionType =
    typeof job.position_type === "string" ? job.position_type : undefined;
  const applyUrl =
    typeof job.apply_url === "string" && job.apply_url.trim().length > 0
      ? job.apply_url
      : jobUrl;

  return {
    source: "workingnomads",
    sourceJobId:
      sourceJobId ??
      (legacyUrl ? /\/job\/go\/(\d+)\/?$/i.exec(legacyUrl)?.[1] : undefined),
    title,
    employer:
      typeof job.company === "string"
        ? job.company
        : typeof job.company_name === "string"
          ? job.company_name
          : "Unknown Employer",
    jobUrl,
    applicationLink: applyUrl,
    location,
    jobDescription: description,
    datePosted: typeof job.pub_date === "string" ? job.pub_date : undefined,
    jobType: inferJobType(
      `${title}\n${description ?? ""}\n${location}\n${tags.join(", ")}`,
      positionType,
    ),
    jobFunction: category,
    disciplines: tags.length > 0 ? tags.join(", ") : category,
    skills: tags.length > 0 ? tags.join(", ") : undefined,
    isRemote: true,
  };
}

function matchesWorkplaceTypes(
  workplaceTypes: WorkingNomadsWorkplaceType[] | undefined,
): boolean {
  if (!workplaceTypes || workplaceTypes.length === 0) return true;
  return workplaceTypes.includes("remote");
}

export async function runWorkingNomads(
  options: RunWorkingNomadsOptions = {},
): Promise<WorkingNomadsResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = toPositiveIntOrFallback(options.maxJobsPerTerm, 50);
  const explicitLocations = resolveExplicitLocations(
    options.locations,
    options.selectedCountry,
  );
  const locationTokens =
    explicitLocations.length > 0
      ? []
      : getCountrySearchTokens(options.selectedCountry);

  if (!matchesWorkplaceTypes(options.workplaceTypes)) {
    return { success: true, jobs: [] };
  }

  try {
    const jobs: CreateJobInput[] = [];
    const seen = new Set<string>();

    for (const [index, searchTerm] of searchTerms.entries()) {
      if (options.shouldCancel?.()) {
        return { success: true, jobs };
      }

      options.onProgress?.({
        type: "term_start",
        termIndex: index + 1,
        termTotal: searchTerms.length,
        searchTerm,
      });

      const fetchedJobs = await fetchWorkingNomadsJobs({
        fetchImpl,
        searchTerm,
        locationTokens,
        maxJobsPerTerm,
      });

      let jobsFoundTerm = 0;
      for (const job of fetchedJobs) {
        if (options.shouldCancel?.()) {
          return { success: true, jobs };
        }
        if (jobsFoundTerm >= maxJobsPerTerm) {
          break;
        }
        if (!matchesSearchTerm(job, searchTerm)) {
          continue;
        }

        const mapped = mapWorkingNomadsJob(job);
        if (!mapped) continue;
        if (
          explicitLocations.length > 0 &&
          !explicitLocations.some((location) =>
            matchesRequestedLocation(mapped.location, location),
          )
        ) {
          continue;
        }

        const dedupeKey = mapped.sourceJobId || mapped.jobUrl;
        if (seen.has(dedupeKey)) continue;

        seen.add(dedupeKey);
        jobs.push(mapped);
        jobsFoundTerm += 1;
      }

      options.onProgress?.({
        type: "term_complete",
        termIndex: index + 1,
        termTotal: searchTerms.length,
        searchTerm,
        jobsFoundTerm,
      });
    }

    return {
      success: true,
      jobs,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unexpected error while running Working Nomads extractor.";

    return {
      success: false,
      jobs: [],
      error: message,
    };
  }
}
