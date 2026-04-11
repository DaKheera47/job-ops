import { normalizeCountryKey } from "job-ops-shared/location-support";
import {
  matchesRequestedCity,
  normalizeLocationToken,
  resolveSearchCities,
} from "job-ops-shared/search-cities";
import type { CreateJobInput } from "job-ops-shared/types/jobs";

const GOLANG_JOBS_SUPABASE_URL = "https://mvjyjzestmcxxmmmakec.supabase.co";
const GOLANG_JOBS_DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im12anlqemVzdG1jeHhtbW1ha2VjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2NDMyNzksImV4cCI6MjA1OTIxOTI3OX0.AEucvhTZofaPFnPmnCMM2ptuE3Iy06_uao4n-6AmEgM";
const GOLANG_JOBS_PAGE_SIZE = 200;
const GOLANG_JOBS_MAX_PAGES = 10;
const GOLANG_JOBS_SUPABASE_ANON_KEY_ENV = "GOLANG_JOBS_SUPABASE_ANON_KEY";

export type GolangJobsWorkplaceType = "remote" | "hybrid" | "onsite";

export type GolangJobsProgressEvent =
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

export interface RunGolangJobsOptions {
  searchTerms?: string[];
  selectedCountry?: string;
  locations?: string[];
  workplaceTypes?: GolangJobsWorkplaceType[];
  maxJobsPerTerm?: number;
  supabaseAnonKey?: string;
  onProgress?: (event: GolangJobsProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface GolangJobsResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

interface GolangJobsCity {
  name?: unknown;
  country?: unknown;
}

interface GolangJobsRow {
  id?: unknown;
  title?: unknown;
  company?: unknown;
  type?: unknown;
  application_url?: unknown;
  slug?: unknown;
  posted_at?: unknown;
  description?: unknown;
  requirements?: unknown;
  cities?: GolangJobsCity | null;
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

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mapJobType(value: string | undefined): string | undefined {
  switch (value?.trim().toLowerCase()) {
    case "full-time":
      return "Full-time";
    case "part-time":
      return "Part-time";
    case "contract":
      return "Contract";
    case "internship":
      return "Internship";
    default:
      return value?.trim() || undefined;
  }
}

function isRemoteCity(cityName: string | undefined): boolean {
  return normalizeLocationToken(cityName) === "remote";
}

function formatLocation(
  cityName: string | undefined,
  country: string | undefined,
): string {
  const city = cityName?.trim();
  const countryLabel = country?.trim();

  if (isRemoteCity(city)) {
    return countryLabel ? `Remote (${countryLabel})` : "Remote";
  }

  if (!city) return countryLabel ?? "Unknown location";
  if (!countryLabel) return city;
  if (normalizeLocationToken(city) === normalizeCountryKey(countryLabel)) {
    return countryLabel;
  }

  return `${city}, ${countryLabel}`;
}

function matchesSearchTerm(job: GolangJobsRow, searchTerm: string): boolean {
  const normalizedTerm = normalizeText(searchTerm);
  if (!normalizedTerm) return true;

  const requirements = Array.isArray(job.requirements)
    ? job.requirements
        .filter((value): value is string => typeof value === "string")
        .join(" ")
    : "";
  const city =
    job.cities && typeof job.cities === "object" && !Array.isArray(job.cities)
      ? typeof job.cities.name === "string"
        ? job.cities.name
        : ""
      : "";
  const country =
    job.cities && typeof job.cities === "object" && !Array.isArray(job.cities)
      ? typeof job.cities.country === "string"
        ? job.cities.country
        : ""
      : "";

  const haystack = normalizeText(
    [
      typeof job.title === "string" ? job.title : "",
      typeof job.company === "string" ? job.company : "",
      typeof job.description === "string" ? job.description : "",
      requirements,
      city,
      country,
    ].join(" "),
  );

  if (!haystack) return false;
  if (haystack.includes(normalizedTerm)) return true;

  return normalizedTerm
    .split(" ")
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

function matchesRequestedLocation(
  location: string | undefined,
  requestedLocation: string,
): boolean {
  if (!location) return false;
  if (matchesRequestedCity(location, requestedLocation)) return true;

  const normalizedLocation = normalizeLocationToken(location);
  const normalizedRequestedLocation = normalizeLocationToken(requestedLocation);
  if (!normalizedLocation || !normalizedRequestedLocation) return false;

  return normalizedLocation.includes(normalizedRequestedLocation);
}

function matchesSelectedCountry(
  row: GolangJobsRow,
  selectedCountry: string | undefined,
): boolean {
  const normalizedCountry = normalizeCountryKey(selectedCountry);
  if (!normalizedCountry || normalizedCountry === "worldwide") {
    return true;
  }

  const cityCountry =
    row.cities && typeof row.cities === "object" && !Array.isArray(row.cities)
      ? typeof row.cities.country === "string"
        ? normalizeCountryKey(row.cities.country)
        : ""
      : "";

  if (normalizedCountry === "usa/ca") {
    return cityCountry === "united states" || cityCountry === "canada";
  }

  return cityCountry === normalizedCountry;
}

function matchesWorkplaceTypes(
  row: GolangJobsRow,
  workplaceTypes: GolangJobsWorkplaceType[] | undefined,
): boolean {
  if (!workplaceTypes || workplaceTypes.length === 0) return true;

  const cityName =
    row.cities && typeof row.cities === "object" && !Array.isArray(row.cities)
      ? typeof row.cities.name === "string"
        ? row.cities.name
        : undefined
      : undefined;

  const workplaceType: GolangJobsWorkplaceType = isRemoteCity(cityName)
    ? "remote"
    : "onsite";

  return workplaceTypes.includes(workplaceType);
}

function mapGolangJobsRow(row: GolangJobsRow): CreateJobInput | null {
  const sourceJobId = typeof row.id === "string" ? row.id : undefined;
  const slug = typeof row.slug === "string" ? row.slug : undefined;
  if (!sourceJobId || !slug) return null;

  const cityName =
    row.cities && typeof row.cities === "object" && !Array.isArray(row.cities)
      ? typeof row.cities.name === "string"
        ? row.cities.name
        : undefined
      : undefined;
  const country =
    row.cities && typeof row.cities === "object" && !Array.isArray(row.cities)
      ? typeof row.cities.country === "string"
        ? row.cities.country
        : undefined
      : undefined;
  const jobUrl = `https://www.golangjobs.tech/golang-jobs/${slug}`;
  const applicationLink =
    typeof row.application_url === "string" &&
    row.application_url.trim().length > 0
      ? row.application_url
      : jobUrl;
  const requirements = Array.isArray(row.requirements)
    ? row.requirements
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  return {
    source: "golangjobs",
    sourceJobId,
    title: typeof row.title === "string" ? row.title : "Unknown Title",
    employer:
      typeof row.company === "string" ? row.company : "Unknown Employer",
    jobUrl,
    applicationLink,
    location: formatLocation(cityName, country),
    datePosted: typeof row.posted_at === "string" ? row.posted_at : undefined,
    jobDescription:
      typeof row.description === "string" ? row.description : undefined,
    jobType: typeof row.type === "string" ? mapJobType(row.type) : undefined,
    skills: requirements.length > 0 ? requirements.join(", ") : undefined,
    isRemote: isRemoteCity(cityName),
  };
}

async function fetchGolangJobsPage(args: {
  fetchImpl: typeof fetch;
  page: number;
  supabaseAnonKey: string;
}): Promise<GolangJobsRow[]> {
  const offset = args.page * GOLANG_JOBS_PAGE_SIZE;
  const url = new URL(`${GOLANG_JOBS_SUPABASE_URL}/rest/v1/jobs`);
  url.searchParams.set(
    "select",
    "id,title,company,type,application_url,slug,posted_at,description,requirements,cities(name,country)",
  );
  url.searchParams.set("is_archived", "eq.false");
  url.searchParams.set("order", "posted_at.desc");
  url.searchParams.set("limit", String(GOLANG_JOBS_PAGE_SIZE));
  url.searchParams.set("offset", String(offset));

  const response = await args.fetchImpl(url.toString(), {
    headers: {
      apikey: args.supabaseAnonKey,
      authorization: `Bearer ${args.supabaseAnonKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Golang Jobs request failed with ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("Golang Jobs returned an unexpected payload.");
  }

  return payload as GolangJobsRow[];
}

async function fetchAllGolangJobs(args: {
  fetchImpl: typeof fetch;
  supabaseAnonKey: string;
  shouldCancel?: () => boolean;
}): Promise<GolangJobsRow[]> {
  const rows: GolangJobsRow[] = [];

  for (let page = 0; page < GOLANG_JOBS_MAX_PAGES; page += 1) {
    if (args.shouldCancel?.()) {
      break;
    }
    const nextRows = await fetchGolangJobsPage({
      fetchImpl: args.fetchImpl,
      page,
      supabaseAnonKey: args.supabaseAnonKey,
    });
    rows.push(...nextRows);
    if (nextRows.length < GOLANG_JOBS_PAGE_SIZE) {
      break;
    }
  }

  return rows;
}

function resolveExplicitLocations(
  locations: string[] | undefined,
  selectedCountry: string | undefined,
): string[] {
  const normalizedCountry = normalizeCountryKey(selectedCountry);

  return resolveSearchCities({ list: locations }).filter((location) => {
    const normalizedLocation = normalizeLocationToken(location);
    if (!normalizedLocation) return false;
    if (!normalizedCountry) return true;
    if (normalizedCountry === "usa/ca") {
      return (
        normalizedLocation !== "united states" &&
        normalizedLocation !== "canada"
      );
    }
    return normalizedLocation !== normalizedCountry;
  });
}

export async function runGolangJobs(
  options: RunGolangJobsOptions = {},
): Promise<GolangJobsResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const supabaseAnonKey =
    options.supabaseAnonKey ??
    process.env[GOLANG_JOBS_SUPABASE_ANON_KEY_ENV]?.trim() ??
    GOLANG_JOBS_DEFAULT_SUPABASE_ANON_KEY;
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = toPositiveIntOrFallback(options.maxJobsPerTerm, 50);
  const explicitLocations = resolveExplicitLocations(
    options.locations,
    options.selectedCountry,
  );

  try {
    const sourceRows = await fetchAllGolangJobs({
      fetchImpl,
      supabaseAnonKey,
      shouldCancel: options.shouldCancel,
    });
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

      let jobsFoundTerm = 0;
      for (const row of sourceRows) {
        if (options.shouldCancel?.()) {
          return { success: true, jobs };
        }
        if (jobsFoundTerm >= maxJobsPerTerm) {
          break;
        }
        if (!matchesSearchTerm(row, searchTerm)) continue;
        if (!matchesSelectedCountry(row, options.selectedCountry)) continue;
        if (!matchesWorkplaceTypes(row, options.workplaceTypes)) continue;

        const mapped = mapGolangJobsRow(row);
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

    return { success: true, jobs };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unexpected error while running Golang Jobs extractor.";

    return {
      success: false,
      jobs: [],
      error: message,
    };
  }
}
