import { normalizeCountryKey } from "@shared/location-support.js";
import type { CreateJobInput, JobLocationEvidence } from "@shared/types/jobs";

const JOBINDEX_BASE_URL = "https://www.jobindex.dk";
const JOBINDEX_SEARCH_URL = `${JOBINDEX_BASE_URL}/jobsoegning`;
const JOBINDEX_MAX_PAGES = 50;

export type JobindexProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "page_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      page: number;
      pageTotal: number;
      jobsFoundTerm: number;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export interface RunJobindexOptions {
  searchTerms?: string[];
  selectedCountry?: string;
  cityLocations?: string[];
  maxJobsPerTerm?: number;
  onProgress?: (event: JobindexProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface JobindexResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

interface JobindexAddress {
  city?: unknown;
  line?: unknown;
  simple_string?: unknown;
  zipcode?: unknown;
  coordinates?: {
    latitude?: unknown;
    longitude?: unknown;
  };
}

interface JobindexCompany {
  companyprofile_url?: unknown;
  homeurl?: unknown;
  logo?: unknown;
  name?: unknown;
}

interface JobindexRating {
  ratings?: unknown;
  score?: unknown;
}

interface JobindexSearchResult {
  addresses?: unknown;
  app_apply_url?: unknown;
  apply_deadline?: unknown;
  apply_deadline_asap?: unknown;
  apply_url?: unknown;
  area?: unknown;
  company?: JobindexCompany | null;
  companytext?: unknown;
  firstdate?: unknown;
  headline?: unknown;
  home_workplace?: unknown;
  html?: unknown;
  lastdate?: unknown;
  listlogo_url?: unknown;
  rating?: JobindexRating | null;
  share_url?: unknown;
  source?: unknown;
  tid?: unknown;
  url?: unknown;
  workplace_company?: JobindexCompany | null;
}

interface JobindexSearchResponse {
  max_page?: unknown;
  page_size?: unknown;
  results?: unknown;
  total_pages?: unknown;
}

interface JobindexGeoareaOption {
  id?: unknown;
  text?: unknown;
  typeid?: unknown;
}

interface JobindexStoreData {
  geoareaOptions?: unknown;
  searchResponse?: JobindexSearchResponse;
}

interface JobindexStash {
  "jobsearch/result_app"?: {
    storeData?: JobindexStoreData;
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

function getString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function getNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
    rsquo: "'",
    lsquo: "'",
    rdquo: '"',
    ldquo: '"',
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const key = String(entity).toLowerCase();
    if (key.startsWith("#x")) {
      const parsed = Number.parseInt(key.slice(2), 16);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : match;
    }
    if (key.startsWith("#")) {
      const parsed = Number.parseInt(key.slice(1), 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : match;
    }
    return named[key] ?? match;
  });
}

function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function toAbsoluteUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, JOBINDEX_BASE_URL).toString();
  } catch {
    return undefined;
  }
}

function extractFirstJobLink(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const headingMatch = html.match(
    /<h4\b[\s\S]*?<a\b[^>]*\bhref=(["'])(.*?)\1/i,
  );
  return toAbsoluteUrl(decodeHtmlEntities(headingMatch?.[2] ?? ""));
}

function extractDescription(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const paragraphs = [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => stripHtml(match[1] ?? ""))
    .filter(Boolean);

  if (paragraphs.length > 0) {
    return paragraphs.join("\n\n");
  }

  const stripped = stripHtml(html);
  return stripped || undefined;
}

function buildLocation(addresses: JobindexAddress[], area: string | undefined) {
  if (addresses.length === 0) return area;
  const first = addresses[0];
  const simple = getString(first.simple_string);
  if (simple) return simple;

  const city = getString(first.city);
  const zipcode = getString(first.zipcode);
  if (zipcode && city) return `${zipcode} ${city}`;
  return city ?? area;
}

function buildLocationEvidence(args: {
  addresses: JobindexAddress[];
  area?: string;
  location?: string;
}): JobLocationEvidence | undefined {
  const first = args.addresses[0];
  const city = getString(first?.city) ?? args.area;
  const location = args.location ?? city;
  if (!location) return undefined;
  const latitude = getNumber(first?.coordinates?.latitude);
  const longitude = getNumber(first?.coordinates?.longitude);
  const sourceNotes =
    latitude !== undefined && longitude !== undefined
      ? [`coordinates:${latitude},${longitude}`]
      : undefined;

  return {
    location,
    country: "denmark",
    city,
    source: "jobindex",
    evidenceQuality: first ? "exact" : "approximate",
    sourceNotes,
  };
}

function parseAddresses(value: unknown): JobindexAddress[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (address): address is JobindexAddress =>
      address !== null && typeof address === "object",
  );
}

export function extractJobindexStoreData(html: string): JobindexStoreData {
  const assignmentStart = html.indexOf("var Stash =");
  if (assignmentStart < 0) {
    throw new Error("Jobindex Stash payload was not found.");
  }

  const jsonStart = html.indexOf("{", assignmentStart);
  if (jsonStart < 0) {
    throw new Error("Jobindex Stash JSON start was not found.");
  }

  const scriptEnd = html.indexOf("</script>", jsonStart);
  if (scriptEnd < 0) {
    throw new Error("Jobindex Stash script end was not found.");
  }

  const jsonText = html.slice(jsonStart, scriptEnd).trim().replace(/;\s*$/, "");
  if (!jsonText.endsWith("}")) {
    throw new Error("Jobindex Stash JSON end was not found.");
  }

  const stash = JSON.parse(jsonText) as JobindexStash;
  const storeData = stash["jobsearch/result_app"]?.storeData;
  if (!storeData || typeof storeData !== "object") {
    throw new Error("Jobindex storeData payload was not found.");
  }

  return storeData;
}

export function extractJobindexSearchResponse(
  html: string,
): JobindexSearchResponse {
  const searchResponse = extractJobindexStoreData(html).searchResponse;
  if (!searchResponse || typeof searchResponse !== "object") {
    throw new Error("Jobindex searchResponse payload was not found.");
  }

  return searchResponse;
}

function normalizeLocationLabel(value: string): string {
  return value
    .replace(/[æÆ]/g, "ae")
    .replace(/[øØ]/g, "o")
    .replace(/[åÅ]/g, "aa")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseGeoareaOptions(value: unknown): JobindexGeoareaOption[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (option): option is JobindexGeoareaOption =>
      option !== null && typeof option === "object",
  );
}

function getGeoareaPreferenceRank(option: JobindexGeoareaOption): number {
  const typeId = getNumber(option.typeid);
  switch (typeId) {
    case 30:
      return 0;
    case 0:
      return 1;
    case 20:
      return 2;
    case 10:
      return 3;
    default:
      return 4;
  }
}

export function resolveGeoareaIds(
  cityLocations: string[],
  geoareaOptions: JobindexGeoareaOption[],
): number[] {
  if (cityLocations.length === 0 || geoareaOptions.length === 0) {
    return [];
  }

  const ids: number[] = [];
  const seen = new Set<number>();

  for (const cityLocation of cityLocations) {
    const normalizedCity = normalizeLocationLabel(cityLocation);
    if (!normalizedCity) continue;

    const matches = geoareaOptions
      .map((option) => ({
        option,
        text: getString(option.text),
        id: getNumber(option.id),
      }))
      .filter(
        (
          entry,
        ): entry is {
          option: JobindexGeoareaOption;
          text: string;
          id: number;
        } =>
          entry.text !== undefined &&
          entry.id !== undefined &&
          normalizeLocationLabel(entry.text) === normalizedCity,
      )
      .sort(
        (left, right) =>
          getGeoareaPreferenceRank(left.option) -
          getGeoareaPreferenceRank(right.option),
      );

    const matchedId = matches[0]?.id;
    if (matchedId === undefined || seen.has(matchedId)) continue;
    seen.add(matchedId);
    ids.push(matchedId);
  }

  return ids;
}

export function buildJobindexSearchUrl(
  searchTerm: string,
  page: number,
  geoareaIds: number[] = [],
): string {
  const url = new URL(JOBINDEX_SEARCH_URL);
  url.searchParams.set("q", searchTerm);
  for (const geoareaId of geoareaIds) {
    url.searchParams.append("geoareaid", String(geoareaId));
  }
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }
  return url.toString();
}

export function mapJobindexResult(
  result: JobindexSearchResult,
): CreateJobInput | null {
  const sourceJobId = getString(result.tid);
  const shareUrl = toAbsoluteUrl(getString(result.share_url));
  const jobUrl = shareUrl ?? toAbsoluteUrl(getString(result.url));
  if (!sourceJobId || !jobUrl) return null;

  const company = result.workplace_company ?? result.company ?? undefined;
  const addresses = parseAddresses(result.addresses);
  const area = getString(result.area);
  const location = buildLocation(addresses, area);
  const employer =
    getString(result.companytext) ??
    getString(company?.name) ??
    "Unknown Employer";
  const applicationLink =
    extractFirstJobLink(getString(result.html)) ??
    toAbsoluteUrl(getString(result.app_apply_url)) ??
    toAbsoluteUrl(getString(result.apply_url)) ??
    jobUrl;
  const ratingScore = getNumber(result.rating?.score);
  const ratingCount = getNumber(result.rating?.ratings);

  return {
    source: "jobindex",
    sourceJobId,
    title: getString(result.headline) ?? "Unknown Title",
    employer,
    employerUrl:
      toAbsoluteUrl(getString(company?.homeurl)) ??
      toAbsoluteUrl(getString(company?.companyprofile_url)),
    jobUrl,
    jobUrlDirect: toAbsoluteUrl(getString(result.url)),
    applicationLink,
    location,
    locationEvidence: buildLocationEvidence({ addresses, area, location }),
    datePosted: getString(result.firstdate),
    deadline:
      getString(result.apply_deadline) ??
      (result.apply_deadline_asap === true
        ? "ASAP"
        : getString(result.lastdate)),
    jobDescription: extractDescription(getString(result.html)),
    isRemote:
      typeof result.home_workplace === "boolean"
        ? result.home_workplace
        : undefined,
    companyLogo:
      toAbsoluteUrl(getString(result.listlogo_url)) ??
      toAbsoluteUrl(getString(company?.logo)),
    companyRating: ratingScore,
    companyReviewsCount: ratingCount,
    companyUrlDirect: toAbsoluteUrl(getString(company?.homeurl)),
  };
}

async function fetchSearchPageHtml(args: {
  fetchImpl: typeof fetch;
  searchTerm: string;
  page: number;
  geoareaIds?: number[];
}): Promise<string> {
  const url = buildJobindexSearchUrl(
    args.searchTerm,
    args.page,
    args.geoareaIds,
  );
  const response = await args.fetchImpl(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9,da;q=0.8",
      "user-agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(`Jobindex request failed with ${response.status}`);
  }

  return response.text();
}

async function fetchSearchResponse(args: {
  fetchImpl: typeof fetch;
  searchTerm: string;
  page: number;
  geoareaIds?: number[];
}): Promise<JobindexSearchResponse> {
  const html = await fetchSearchPageHtml(args);
  return extractJobindexSearchResponse(html);
}

async function fetchGeoareaOptions(args: {
  fetchImpl: typeof fetch;
  searchTerm: string;
}): Promise<JobindexGeoareaOption[]> {
  const html = await fetchSearchPageHtml({
    fetchImpl: args.fetchImpl,
    searchTerm: args.searchTerm,
    page: 1,
  });

  return parseGeoareaOptions(extractJobindexStoreData(html).geoareaOptions);
}

export async function runJobindex(
  options: RunJobindexOptions = {},
): Promise<JobindexResult> {
  if (normalizeCountryKey(options.selectedCountry) !== "denmark") {
    return { success: true, jobs: [] };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const cityLocations = options.cityLocations ?? [];
  const maxJobsPerTerm = toPositiveIntOrFallback(options.maxJobsPerTerm, 50);
  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();

  try {
    const geoareaIds =
      cityLocations.length > 0
        ? resolveGeoareaIds(
            cityLocations,
            await fetchGeoareaOptions({
              fetchImpl,
              searchTerm: searchTerms[0] ?? "software engineer",
            }),
          )
        : [];

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
      let pageTotal = 1;
      for (let page = 1; page <= pageTotal; page += 1) {
        if (options.shouldCancel?.()) {
          return { success: true, jobs };
        }
        if (jobsFoundTerm >= maxJobsPerTerm) break;

        const searchResponse = await fetchSearchResponse({
          fetchImpl,
          searchTerm,
          page,
          geoareaIds,
        });
        const rawResults = Array.isArray(searchResponse.results)
          ? (searchResponse.results as JobindexSearchResult[])
          : [];
        const parsedTotalPages = toPositiveIntOrFallback(
          typeof searchResponse.total_pages === "number" ||
            typeof searchResponse.total_pages === "string"
            ? searchResponse.total_pages
            : undefined,
          1,
        );
        pageTotal = Math.min(parsedTotalPages, JOBINDEX_MAX_PAGES);

        for (const rawResult of rawResults) {
          if (jobsFoundTerm >= maxJobsPerTerm) break;
          const mapped = mapJobindexResult(rawResult);
          if (!mapped) continue;
          const dedupeKey = mapped.sourceJobId || mapped.jobUrl;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          jobs.push(mapped);
          jobsFoundTerm += 1;
        }

        options.onProgress?.({
          type: "page_complete",
          termIndex: index + 1,
          termTotal: searchTerms.length,
          searchTerm,
          page,
          pageTotal,
          jobsFoundTerm,
        });
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
          : "Unexpected error while running Jobindex extractor.";

    return {
      success: false,
      jobs: [],
      error: message,
    };
  }
}
