import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseSearchTerms } from "job-ops-shared/utils/search-terms";
import {
  toNumberOrNull,
  toStringOrNull,
} from "job-ops-shared/utils/type-conversion";

const API_BASE = "https://api.adzuna.com/v1/api";
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";
const DEFAULT_SEARCH_TERM = "web developer";

type AdzunaCompany = { display_name?: unknown };
type AdzunaLocation = { display_name?: unknown };
type AdzunaJob = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  created?: unknown;
  redirect_url?: unknown;
  company?: AdzunaCompany;
  location?: AdzunaLocation;
  salary_min?: unknown;
  salary_max?: unknown;
  contract_time?: unknown;
  contract_type?: unknown;
};

type ExtractedJob = {
  source: "adzuna";
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
};

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = input ? Number.parseInt(input, 10) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function emitProgress(payload: Record<string, unknown>): void {
  if (process.env.JOBOPS_EMIT_PROGRESS !== "1") return;
  console.log(`${JOBOPS_PROGRESS_PREFIX}${JSON.stringify(payload)}`);
}

function formatSalary(job: AdzunaJob): string | null {
  const min = toNumberOrNull(job.salary_min);
  const max = toNumberOrNull(job.salary_max);

  if (min === null && max === null) return null;

  if (min !== null && max !== null) {
    return `${Math.round(min)}-${Math.round(max)}`;
  }
  if (min !== null) return `${Math.round(min)}+`;
  if (max !== null) return `${Math.round(max)}`;
  return null;
}

function mapJob(raw: AdzunaJob): ExtractedJob | null {
  const id = toStringOrNull(raw.id);
  const title = toStringOrNull(raw.title) ?? "Unknown Title";
  const employer =
    toStringOrNull(raw.company?.display_name) ?? "Unknown Employer";
  const jobUrl = toStringOrNull(raw.redirect_url);
  if (!jobUrl) return null;

  const contractType = toStringOrNull(raw.contract_type);
  const contractTime = toStringOrNull(raw.contract_time);
  const jobType = [contractType, contractTime].filter(Boolean).join(" / ");

  return {
    source: "adzuna",
    sourceJobId: id ?? undefined,
    title,
    employer,
    jobUrl,
    applicationLink: jobUrl,
    location: toStringOrNull(raw.location?.display_name) ?? undefined,
    salary: formatSalary(raw) ?? undefined,
    datePosted: toStringOrNull(raw.created) ?? undefined,
    jobDescription: toStringOrNull(raw.description) ?? undefined,
    jobType: jobType || undefined,
  };
}

async function fetchJobsPage(args: {
  country: string;
  page: number;
  appId: string;
  appKey: string;
  what: string;
  resultsPerPage: number;
}): Promise<AdzunaJob[]> {
  const url = new URL(`${API_BASE}/jobs/${args.country}/search/${args.page}`);
  url.searchParams.set("app_id", args.appId);
  url.searchParams.set("app_key", args.appKey);
  if (args.what) {
    url.searchParams.set("what", args.what);
  }
  url.searchParams.set("results_per_page", String(args.resultsPerPage));

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Adzuna request failed with status ${response.status}`);
  }

  const body = (await response.json()) as { results?: unknown };
  if (!Array.isArray(body.results)) return [];
  return body.results as AdzunaJob[];
}

async function run(): Promise<void> {
  const appId = requireEnv("ADZUNA_APP_ID");
  const appKey = requireEnv("ADZUNA_APP_KEY");
  const country = (process.env.ADZUNA_COUNTRY || "gb").trim().toLowerCase();
  const maxJobsPerTerm = parsePositiveInt(
    process.env.ADZUNA_MAX_JOBS_PER_TERM,
    50,
  );
  const configuredResultsPerPage = parsePositiveInt(
    process.env.ADZUNA_RESULTS_PER_PAGE,
    50,
  );
  const resultsPerPage = Math.min(50, configuredResultsPerPage);
  const searchTerms = parseSearchTerms(
    process.env.ADZUNA_SEARCH_TERMS,
    DEFAULT_SEARCH_TERM,
  );
  const outputJson =
    process.env.ADZUNA_OUTPUT_JSON ||
    join(process.cwd(), "storage/datasets/default/jobs.json");

  const jobs: ExtractedJob[] = [];

  for (let i = 0; i < searchTerms.length; i += 1) {
    const searchTerm = searchTerms[i];
    const termIndex = i + 1;

    emitProgress({
      event: "term_start",
      termIndex,
      termTotal: searchTerms.length,
      searchTerm,
    });

    let page = 1;
    let termCount = 0;
    while (termCount < maxJobsPerTerm) {
      const remaining = maxJobsPerTerm - termCount;
      const take = Math.min(resultsPerPage, remaining);
      const pageResults = await fetchJobsPage({
        country,
        page,
        appId,
        appKey,
        what: searchTerm,
        resultsPerPage: take,
      });

      let mappedOnPage = 0;
      for (const raw of pageResults) {
        if (termCount >= maxJobsPerTerm) break;
        const mapped = mapJob(raw);
        if (!mapped) continue;
        jobs.push(mapped);
        termCount += 1;
        mappedOnPage += 1;
      }

      emitProgress({
        event: "page_fetched",
        termIndex,
        termTotal: searchTerms.length,
        searchTerm,
        pageNo: page,
        resultsOnPage: mappedOnPage,
        totalCollected: termCount,
      });

      if (pageResults.length < take) break;
      page += 1;
      if (page > 100) break;
    }

    emitProgress({
      event: "term_complete",
      termIndex,
      termTotal: searchTerms.length,
      searchTerm,
      jobsFoundTerm: termCount,
    });
  }

  await mkdir(dirname(outputJson), { recursive: true });
  await writeFile(outputJson, `${JSON.stringify(jobs, null, 2)}\n`, "utf-8");
  console.log(`Adzuna extractor wrote ${jobs.length} jobs`);
}

run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Adzuna extractor failed: ${message}`);
  process.exitCode = 1;
});
