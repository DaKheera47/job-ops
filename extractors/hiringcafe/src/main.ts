import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { launchOptions } from "camoufox-js";
import { parseSearchTerms } from "job-ops-shared/utils/search-terms";
import {
  toNumberOrNull,
  toStringOrNull,
} from "job-ops-shared/utils/type-conversion";
import { firefox, type Page } from "playwright";
import {
  normalizeCountryKey,
  resolveHiringCafeCountryLocation,
} from "./country-map.js";
import { createDefaultSearchState } from "./default-search-state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE_URL = "https://hiring.cafe";
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";
const DEFAULT_MAX_JOBS_PER_TERM = 200;
const DEFAULT_SEARCH_TERM = "web developer";
const DEFAULT_DATE_FETCHED_PAST_N_DAYS = 30;
const DEFAULT_LOCATION_RADIUS_MILES = 1;
const PAGE_LIMIT = 50;

type RawHiringCafeJob = Record<string, unknown>;

interface ExtractedJob {
  source: "hiringcafe";
  sourceJobId?: string;
  title: string;
  employer: string;
  jobUrl: string;
  applicationLink: string;
  location?: string;
  salary?: string;
  datePosted?: string;
  jobDescription?: string;
  jobType?: string;
}

interface BrowserApiResponse {
  ok: boolean;
  status: number;
  statusText: string;
  data: unknown;
  responseText: string;
}

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

function emitProgress(payload: Record<string, unknown>): void {
  if (process.env.JOBOPS_EMIT_PROGRESS !== "1") return;
  console.log(`${JOBOPS_PROGRESS_PREFIX}${JSON.stringify(payload)}`);
}

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = input ? Number.parseInt(input, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function encodeSearchState(searchState: unknown): string {
  const json = JSON.stringify(searchState);
  const urlEncodedJson = encodeURIComponent(json);
  return Buffer.from(urlEncodedJson, "utf-8").toString("base64");
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

function mapHiringCafeJob(raw: RawHiringCafeJob): ExtractedJob | null {
  const jobInformation = asRecord(raw.job_information);
  const processed = asRecord(raw.v5_processed_job_data);
  const companyInfo = asRecord(jobInformation?.company_info);

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

  const commitments = asStringArray(processed?.commitment);
  const jobType = commitments.length > 0 ? commitments.join(", ") : undefined;

  return {
    source: "hiringcafe",
    sourceJobId,
    title,
    employer,
    jobUrl,
    applicationLink: jobUrl,
    location,
    salary: formatCompensation(processed),
    datePosted: toStringOrNull(processed?.estimated_publish_date) ?? undefined,
    jobDescription: toStringOrNull(jobInformation?.description) ?? undefined,
    jobType,
  };
}

function extractResultsBatch(payload: unknown): RawHiringCafeJob[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is RawHiringCafeJob =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
    );
  }

  const payloadRecord = asRecord(payload);
  const results = payloadRecord?.results;
  if (!Array.isArray(results)) return [];

  return results.filter(
    (item): item is RawHiringCafeJob =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item),
  );
}

function parseTotalCount(payload: unknown): number | null {
  const payloadRecord = asRecord(payload);
  if (!payloadRecord) return null;
  return toNumberOrNull(payloadRecord.total);
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
}): Promise<CityLocationContext | null> {
  const query = `${args.city}, ${args.countryLong}`;
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "1");

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "job-ops-hiringcafe-extractor/1.0",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`geocode failed (${response.status})`);
    }
    const payload = (await response.json()) as unknown;
    if (!Array.isArray(payload) || payload.length === 0) {
      throw new Error("geocode returned no results");
    }
    const first = payload[0] as NominatimResult;
    const lat = Number(first.lat ?? "");
    const lon = Number(first.lon ?? "");
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error("invalid geocode coordinates");
    }
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`City geocode failed for '${query}': ${message}`);
    return null;
  }
}

function createCitySearchState(args: {
  searchQuery: string;
  dateFetchedPastNDays: number;
  context: CityLocationContext;
}): Record<string, unknown> {
  return {
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
    workplaceTypes: ["Remote", "Hybrid", "Onsite"],
    defaultToUserLocation: true,
    userLocation: null,
    physicalEnvironments: [
      "Office",
      "Outdoor",
      "Vehicle",
      "Industrial",
      "Customer-Facing",
    ],
    physicalLaborIntensity: ["Low", "Medium", "High"],
    physicalPositions: ["Sitting", "Standing"],
    oralCommunicationLevels: ["Low", "Medium", "High"],
    computerUsageLevels: ["Low", "Medium", "High"],
    cognitiveDemandLevels: ["Low", "Medium", "High"],
    currency: { label: "Any", value: null },
    frequency: { label: "Any", value: null },
    minCompensationLowEnd: null,
    minCompensationHighEnd: null,
    maxCompensationLowEnd: null,
    maxCompensationHighEnd: null,
    restrictJobsToTransparentSalaries: false,
    calcFrequency: "Yearly",
    commitmentTypes: [
      "Full Time",
      "Part Time",
      "Contract",
      "Internship",
      "Temporary",
      "Seasonal",
      "Volunteer",
    ],
    jobTitleQuery: "",
    jobDescriptionQuery: "",
    associatesDegreeFieldsOfStudy: [],
    excludedAssociatesDegreeFieldsOfStudy: [],
    bachelorsDegreeFieldsOfStudy: [],
    excludedBachelorsDegreeFieldsOfStudy: [],
    mastersDegreeFieldsOfStudy: [],
    excludedMastersDegreeFieldsOfStudy: [],
    doctorateDegreeFieldsOfStudy: [],
    excludedDoctorateDegreeFieldsOfStudy: [],
    associatesDegreeRequirements: [],
    bachelorsDegreeRequirements: [],
    mastersDegreeRequirements: [],
    doctorateDegreeRequirements: [],
    licensesAndCertifications: [],
    excludedLicensesAndCertifications: [],
    excludeAllLicensesAndCertifications: false,
    seniorityLevel: [
      "No Prior Experience Required",
      "Entry Level",
      "Mid Level",
      "Senior Level",
    ],
    roleTypes: ["Individual Contributor", "People Manager"],
    roleYoeRange: [0, 20],
    excludeIfRoleYoeIsNotSpecified: false,
    managementYoeRange: [0, 20],
    excludeIfManagementYoeIsNotSpecified: false,
    securityClearances: [
      "None",
      "Confidential",
      "Secret",
      "Top Secret",
      "Top Secret/SCI",
      "Public Trust",
      "Interim Clearances",
      "Other",
    ],
    languageRequirements: [],
    excludedLanguageRequirements: [],
    languageRequirementsOperator: "OR",
    excludeJobsWithAdditionalLanguageRequirements: false,
    airTravelRequirement: ["None", "Minimal", "Moderate", "Extensive"],
    landTravelRequirement: ["None", "Minimal", "Moderate", "Extensive"],
    morningShiftWork: [],
    eveningShiftWork: [],
    overnightShiftWork: [],
    weekendAvailabilityRequired: "Doesn't Matter",
    holidayAvailabilityRequired: "Doesn't Matter",
    overtimeRequired: "Doesn't Matter",
    onCallRequirements: [
      "None",
      "Occasional (once a month or less)",
      "Regular (once a week or more)",
    ],
    benefitsAndPerks: [],
    applicationFormEase: [],
    companyNames: [],
    excludedCompanyNames: [],
    companyHqCountries: [],
    excludedCompanyHqCountries: [],
    usaGovPref: null,
    industries: [],
    excludedIndustries: [],
    companyKeywords: [],
    companyKeywordsBooleanOperator: "OR",
    excludedCompanyKeywords: [],
    hideJobTypes: [],
    encouragedToApply: [],
    searchQuery: args.searchQuery,
    dateFetchedPastNDays: args.dateFetchedPastNDays,
    hiddenCompanies: [],
    user: null,
    searchModeSelectedCompany: null,
    departments: [],
    restrictedSearchAttributes: [],
    sortBy: "default",
    technologyKeywordsQuery: "",
    requirementsKeywordsQuery: "",
    companyPublicOrPrivate: "all",
    latestInvestmentYearRange: [null, null],
    latestInvestmentSeries: [],
    latestInvestmentAmount: null,
    latestInvestmentCurrency: [],
    investors: [],
    excludedInvestors: [],
    isNonProfit: "all",
    organizationTypes: [],
    excludedOrganizationTypes: [],
    companySizeRanges: [],
    minYearFounded: null,
    maxYearFounded: null,
    excludedLatestInvestmentSeries: [],
  };
}

async function callHiringCafeApi(
  page: Page,
  endpoint: string,
  params: Record<string, string>,
): Promise<unknown> {
  const response = await page.evaluate(
    async ({ endpointArg, paramsArg }) => {
      const url = new URL(endpointArg, window.location.origin);
      for (const [key, value] of Object.entries(paramsArg)) {
        url.searchParams.set(key, value);
      }

      const res = await fetch(url.toString(), {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json, text/plain, */*",
        },
      });

      const text = await res.text();
      let data: unknown = null;
      try {
        data = JSON.parse(text);
      } catch {
        // Keep response text for diagnostics.
      }

      const output: BrowserApiResponse = {
        ok: res.ok,
        status: res.status,
        statusText: res.statusText,
        data,
        responseText: text,
      };

      return output;
    },
    { endpointArg: endpoint, paramsArg: params },
  );

  const result = response as BrowserApiResponse;

  if (!result.ok) {
    const snippet = result.responseText.slice(0, 250);
    throw new Error(
      `Hiring Cafe API ${endpoint} failed (${result.status} ${result.statusText}): ${snippet}`,
    );
  }

  if (result.data === null) {
    const snippet = result.responseText.slice(0, 250);
    throw new Error(
      `Hiring Cafe API ${endpoint} returned non-JSON response: ${snippet}`,
    );
  }

  return result.data;
}

async function run(): Promise<void> {
  const searchTerms = parseSearchTerms(
    process.env.HIRING_CAFE_SEARCH_TERMS,
    DEFAULT_SEARCH_TERM,
  );
  const country = normalizeCountryKey(
    process.env.HIRING_CAFE_COUNTRY ?? "united kingdom",
  );
  const maxJobsPerTerm = parsePositiveInt(
    process.env.HIRING_CAFE_MAX_JOBS_PER_TERM,
    DEFAULT_MAX_JOBS_PER_TERM,
  );
  const dateFetchedPastNDays = parsePositiveInt(
    process.env.HIRING_CAFE_DATE_FETCHED_PAST_N_DAYS,
    DEFAULT_DATE_FETCHED_PAST_N_DAYS,
  );
  const locationQuery = process.env.HIRING_CAFE_LOCATION_QUERY?.trim() ?? "";
  const locationRadiusMiles = parsePositiveInt(
    process.env.HIRING_CAFE_LOCATION_RADIUS_MILES,
    DEFAULT_LOCATION_RADIUS_MILES,
  );
  const outputPath =
    process.env.HIRING_CAFE_OUTPUT_JSON ||
    join(__dirname, "../storage/datasets/default/jobs.json");
  const headless = process.env.HIRING_CAFE_HEADLESS !== "false";

  let browser = await firefox.launch(
    await launchOptions({
      headless,
      humanize: true,
      geoip: true,
    }),
  );
  let context = await browser.newContext();
  let page = await context.newPage();

  const allJobs: ExtractedJob[] = [];
  const seen = new Set<string>();

  try {
    const initializePage = async () => {
      await page.goto(BASE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await page.waitForTimeout(2_000);
    };

    try {
      await initializePage();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Camoufox browser startup was unstable, retrying with vanilla Firefox: ${message}`,
      );
      await browser.close();
      browser = await firefox.launch({ headless });
      context = await browser.newContext();
      page = await context.newPage();
      await initializePage();
    }

    const countryLocation = resolveHiringCafeCountryLocation(country);
    const countryLong =
      countryLocation?.address_components[0]?.long_name ?? "United Kingdom";
    const countryShort =
      countryLocation?.address_components[0]?.short_name ?? "GB";
    const cityLocationContext = locationQuery
      ? await resolveCityLocationContext({
          city: locationQuery,
          countryLong,
          countryShort,
          radiusMiles: locationRadiusMiles,
        })
      : null;

    for (let i = 0; i < searchTerms.length; i += 1) {
      const searchTerm = searchTerms[i];
      const termIndex = i + 1;

      emitProgress({
        event: "term_start",
        termIndex,
        termTotal: searchTerms.length,
        searchTerm,
      });

      const searchState = cityLocationContext
        ? createCitySearchState({
            searchQuery: searchTerm,
            dateFetchedPastNDays,
            context: cityLocationContext,
          })
        : createDefaultSearchState({
            searchQuery: searchTerm,
            location: countryLocation,
            dateFetchedPastNDays,
          });
      const encodedSearchState = encodeSearchState(searchState);

      let totalAvailable: number | null = null;
      try {
        const countPayload = await callHiringCafeApi(
          page,
          "/api/search-jobs/get-total-count",
          {
            s: encodedSearchState,
          },
        );
        totalAvailable = parseTotalCount(countPayload);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `Hiring Cafe count request failed for term '${searchTerm}': ${message}`,
        );
      }

      const termTarget =
        totalAvailable !== null
          ? Math.min(maxJobsPerTerm, totalAvailable)
          : maxJobsPerTerm;

      let pageNo = 0;
      let termCollected = 0;

      while (termCollected < termTarget && pageNo < PAGE_LIMIT) {
        const size = Math.min(1000, termTarget - termCollected);
        const jobsPayload = await callHiringCafeApi(page, "/api/search-jobs", {
          size: String(size),
          page: String(pageNo),
          s: encodedSearchState,
        });

        const batch = extractResultsBatch(jobsPayload);
        if (batch.length === 0) break;

        let mappedOnPage = 0;
        for (const rawJob of batch) {
          if (termCollected >= termTarget) break;
          const mapped = mapHiringCafeJob(rawJob);
          if (!mapped) continue;

          const dedupeKey = mapped.sourceJobId || mapped.jobUrl;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          allJobs.push(mapped);
          termCollected += 1;
          mappedOnPage += 1;
        }

        emitProgress({
          event: "page_fetched",
          termIndex,
          termTotal: searchTerms.length,
          searchTerm,
          pageNo,
          resultsOnPage: mappedOnPage,
          totalCollected: termCollected,
        });

        if (batch.length < size) break;
        pageNo += 1;
      }

      emitProgress({
        event: "term_complete",
        termIndex,
        termTotal: searchTerms.length,
        searchTerm,
        jobsFoundTerm: termCollected,
      });
    }
  } finally {
    await browser.close();
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(allJobs, null, 2)}\n`, "utf-8");

  console.log(`Hiring Cafe extractor wrote ${allJobs.length} jobs`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Hiring Cafe extractor failed: ${message}`);
  process.exitCode = 1;
});
