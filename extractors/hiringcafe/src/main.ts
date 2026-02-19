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

    for (let i = 0; i < searchTerms.length; i += 1) {
      const searchTerm = searchTerms[i];
      const termIndex = i + 1;

      emitProgress({
        event: "term_start",
        termIndex,
        termTotal: searchTerms.length,
        searchTerm,
      });

      const location = resolveHiringCafeCountryLocation(country);
      const searchState = createDefaultSearchState({
        searchQuery: searchTerm,
        location,
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
