import type { CreateJobInput, JobLocationEvidence } from "@shared/types/jobs";
import {
  toNumberOrNull,
  toStringOrNull,
} from "@shared/utils/type-conversion.js";
import {
  createLaunchOptions,
  getCloudflareCookieStorageDir,
  invalidateCookies,
  isChallengePage,
  loadCookies,
  readCookieJar,
  saveCookies,
  waitForChallengeResolution,
} from "browser-utils";
import { type Browser, firefox, type Page, type Response } from "playwright";

export type NaukriFreshness = "1" | "3" | "7" | "15" | "30";

const EXTRACTOR_ID = "naukri";
const DEFAULT_FRESHNESS: NaukriFreshness = "7";
const DEFAULT_MAX_JOBS_PER_TERM = 50;
const RESULTS_PER_PAGE = 20;
const REQUEST_TIMEOUT_MS = 45_000;
const NAVIGATION_TIMEOUT_MS = 60_000;
const PAGE_DELAY_MS = 1_200;

type NaukriPlaceholder = {
  type?: unknown;
  label?: unknown;
};

type NaukriRawJob = Record<string, unknown> & {
  placeholders?: NaukriPlaceholder[];
  salaryDetail?: Record<string, unknown>;
  ambitionBoxData?: Record<string, unknown>;
};

type NaukriSearchResponse = {
  jobDetails?: unknown[];
};

export type NaukriProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      location?: string;
    }
  | {
      type: "page_fetched";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      location?: string;
      pageNo: number;
      resultsOnPage: number;
      totalCollected: number;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      location?: string;
      jobsFoundTerm: number;
    };

export interface RunNaukriOptions {
  searchTerms?: string[];
  locations?: string[];
  existingJobUrls?: string[];
  maxJobsPerTerm?: number;
  freshness?: NaukriFreshness;
  onProgress?: (event: NaukriProgressEvent) => void;
  shouldCancel?: () => boolean;
}

export interface NaukriResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
  challengeRequired?: string;
}

export function slugifyKeyword(keyword: string): string {
  return keyword
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function makeSearchPageUrl(args: {
  keyword: string;
  age?: NaukriFreshness;
  location?: string | null;
}): string {
  const keywordSlug = slugifyKeyword(args.keyword) || "jobs";
  const location = args.location?.trim();
  const locationSlug = location ? slugifyKeyword(location) : "";
  const path = locationSlug
    ? `/${keywordSlug}-jobs-in-${locationSlug}`
    : `/${keywordSlug}-jobs`;
  const url = new URL(`https://www.naukri.com${path}`);

  url.searchParams.set("k", args.keyword);
  if (location) {
    url.searchParams.set("l", location);
  }
  url.searchParams.set("jobAge", args.age ?? DEFAULT_FRESHNESS);

  return url.toString();
}

function isNaukriSearchApiResponse(response: Response): boolean {
  return response.url().includes("https://www.naukri.com/jobapi/v3/search");
}

function isApiResponseForPage(response: Response, pageNo: number): boolean {
  if (!isNaukriSearchApiResponse(response)) return false;
  const url = new URL(response.url());
  return url.searchParams.get("pageNo") === String(pageNo);
}

async function isNaukriAccessDenied(page: Page): Promise<boolean> {
  const html = await page.content();
  return (
    html.includes("<title>Access Denied</title>") ||
    html.includes("errors.edgesuite.net") ||
    html.includes("You don't have permission to access")
  );
}

async function assertNoBlockingChallenge(
  page: Page,
  url: string,
): Promise<string | null> {
  if (await isChallengePage(page)) {
    const challenge = await waitForChallengeResolution(page, 30_000);
    if (challenge.status === "passed") {
      await saveCookies(page.context(), EXTRACTOR_ID);
      return null;
    }

    await invalidateCookies(EXTRACTOR_ID);
    return url;
  }

  if (await isNaukriAccessDenied(page)) {
    await invalidateCookies(EXTRACTOR_ID);
    return url;
  }

  return null;
}

async function waitForApiPage(params: {
  page: Page;
  pageNo: number;
  timeoutMs: number;
}): Promise<Response> {
  const { page, pageNo, timeoutMs } = params;
  return await page.waitForResponse(
    (response) => isApiResponseForPage(response, pageNo),
    { timeout: timeoutMs },
  );
}

async function waitForApiPageResult(params: {
  page: Page;
  pageNo: number;
  timeoutMs: number;
}): Promise<{ response: Response } | { error: unknown }> {
  return await waitForApiPage(params).then(
    (response) => ({ response }),
    (error: unknown) => ({ error }),
  );
}

function unwrapApiPageResult(
  result: { response: Response } | { error: unknown },
): Response {
  if ("error" in result) {
    throw result.error;
  }

  return result.response;
}

export function resolveNaukriMaxJobsPerTerm(value: unknown): number {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);

  if (!Number.isFinite(parsed)) return DEFAULT_MAX_JOBS_PER_TERM;
  return Math.max(1, Math.floor(parsed));
}

async function collectJobsFromResponse(response: Response): Promise<unknown[]> {
  const text = await response.text();
  if (!response.ok()) {
    return [];
  }

  let json: NaukriSearchResponse;
  try {
    json = JSON.parse(text) as NaukriSearchResponse;
  } catch {
    return [];
  }

  return Array.isArray(json.jobDetails) ? json.jobDetails : [];
}

async function clickNextPage(page: Page): Promise<boolean> {
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(900);

  const nextCandidates = [
    page.getByRole("link", { name: /^next$/i }),
    page.getByRole("button", { name: /^next$/i }),
    page.locator("a:has-text('Next')"),
    page.locator("button:has-text('Next')"),
    page.locator("[aria-label*='Next' i]"),
    page.locator("text=/^Next$/i"),
  ];

  for (const locator of nextCandidates) {
    const count = await locator.count().catch(() => 0);
    if (count === 0) continue;

    const first = locator.first();
    if (!(await first.isVisible().catch(() => false))) continue;

    await first.click({ timeout: 7_000 });
    return true;
  }

  return false;
}

function getPlaceholder(
  placeholders: NaukriPlaceholder[] | undefined,
  type: string,
): string | undefined {
  const match = placeholders?.find(
    (placeholder) => toStringOrNull(placeholder.type) === type,
  );
  return toStringOrNull(match?.label) ?? undefined;
}

function toNaukriUrl(pathOrUrl: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith("/")) return `https://www.naukri.com${pathOrUrl}`;
  return `https://www.naukri.com/${pathOrUrl}`;
}

function parseDatePosted(value: unknown): string | undefined {
  const timestamp = toNumberOrNull(value);
  if (timestamp === null) return undefined;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function getSalaryLabel(row: NaukriRawJob): string | undefined {
  const placeholderSalary = getPlaceholder(row.placeholders, "salary");
  if (placeholderSalary) return placeholderSalary;

  const salaryDetail = row.salaryDetail;
  if (!salaryDetail) return undefined;
  const hideSalary = salaryDetail.hideSalary === true;
  if (hideSalary) return undefined;

  const min = toNumberOrNull(salaryDetail.minimumSalary);
  const max = toNumberOrNull(salaryDetail.maximumSalary);
  const currency = toStringOrNull(salaryDetail.currency) ?? "INR";
  if (min === null && max === null) return undefined;
  if (min !== null && max !== null && min !== max) {
    return `${currency} ${min}-${max}`;
  }
  return `${currency} ${min ?? max}`;
}

export function mapNaukriJob(row: NaukriRawJob): CreateJobInput | null {
  const jobUrl = toNaukriUrl(toStringOrNull(row.jdURL));
  if (!jobUrl) return null;

  const sourceJobId = toStringOrNull(row.jobId);
  const applyUrl = toNaukriUrl(toStringOrNull(row.companyApplyUrl)) ?? jobUrl;
  const ambitionBoxData = row.ambitionBoxData;
  const rating = toNumberOrNull(ambitionBoxData?.AggregateRating);
  const reviewsCount = toNumberOrNull(ambitionBoxData?.ReviewsCount);
  const tagsAndSkills = toStringOrNull(row.tagsAndSkills);
  const salary = getSalaryLabel(row);
  const location = getPlaceholder(row.placeholders, "location");
  const locationEvidence: JobLocationEvidence = {
    rawLocation: location ?? null,
    location: location ? `${location}, India` : "India",
    countryKey: "india",
    country: "india",
    evidenceQuality: location ? "approximate" : "weak",
    source: "naukri",
    sourceNotes: ["Naukri is scoped to India in this extractor."],
  };

  return {
    source: "naukri",
    sourceJobId: sourceJobId ?? undefined,
    title: toStringOrNull(row.title) ?? "Unknown Title",
    employer: toStringOrNull(row.companyName) ?? "Unknown Employer",
    employerUrl: toNaukriUrl(toStringOrNull(row.staticUrl)) ?? undefined,
    jobUrl,
    applicationLink: applyUrl,
    salary,
    location,
    locationEvidence,
    datePosted: parseDatePosted(row.createdDate),
    jobDescription: toStringOrNull(row.jobDescription) ?? undefined,
    skills: tagsAndSkills ?? undefined,
    experienceRange:
      toStringOrNull(row.experienceText) ??
      getPlaceholder(row.placeholders, "experience"),
    companyLogo:
      toStringOrNull(row.logoPathV3) ??
      toStringOrNull(row.logoPath) ??
      undefined,
    companyRating: rating ?? undefined,
    companyReviewsCount:
      reviewsCount === null ? undefined : Math.floor(reviewsCount),
    salaryCurrency: toStringOrNull(row.currency) ?? undefined,
    salaryMinAmount:
      toNumberOrNull(row.salaryDetail?.minimumSalary) ?? undefined,
    salaryMaxAmount:
      toNumberOrNull(row.salaryDetail?.maximumSalary) ?? undefined,
  };
}

export function dedupeNaukriJobs(
  jobs: CreateJobInput[],
  existingJobUrls: string[] = [],
): CreateJobInput[] {
  const existingUrls = new Set(existingJobUrls);
  const seen = new Set<string>();
  const deduped: CreateJobInput[] = [];

  for (const job of jobs) {
    if (existingUrls.has(job.jobUrl)) continue;

    const key = job.sourceJobId ?? job.jobUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }

  return deduped;
}

function resolveRunLocations(
  locations: string[] | undefined,
): Array<string | null> {
  const normalized = (locations ?? [])
    .map((location) => location.trim())
    .filter(Boolean);

  if (normalized.length === 0) return [null];
  return normalized;
}

async function launchBrowser(): Promise<{
  browser: Browser;
  userAgent?: string;
}> {
  const storageDir = getCloudflareCookieStorageDir();
  const cookieJar = await readCookieJar(EXTRACTOR_ID, storageDir);
  const { launchOptions } = await createLaunchOptions({ headless: true });
  const browser = await firefox.launch(launchOptions);
  return { browser, userAgent: cookieJar.userAgent };
}

async function collectForTerm(params: {
  browser: Browser;
  userAgent?: string;
  searchTerm: string;
  location: string | null;
  maxJobsPerTerm: number;
  freshness: NaukriFreshness;
  onPage: (pageNo: number, jobs: CreateJobInput[]) => void;
  shouldCancel?: () => boolean;
}): Promise<{ jobs: CreateJobInput[]; challengeRequired?: string }> {
  const searchPageUrl = makeSearchPageUrl({
    keyword: params.searchTerm,
    age: params.freshness,
    location: params.location,
  });
  const storageDir = getCloudflareCookieStorageDir();
  const context = await params.browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...(params.userAgent ? { userAgent: params.userAgent } : {}),
  });
  await loadCookies(context, EXTRACTOR_ID, storageDir);
  const page = await context.newPage();
  const jobs: CreateJobInput[] = [];
  const maxPages = Math.max(
    1,
    Math.ceil(params.maxJobsPerTerm / RESULTS_PER_PAGE),
  );

  try {
    const firstApiResponsePromise = waitForApiPageResult({
      page,
      pageNo: 1,
      timeoutMs: REQUEST_TIMEOUT_MS,
    });
    await page.goto(searchPageUrl, {
      waitUntil: "domcontentloaded",
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    const firstChallenge = await assertNoBlockingChallenge(page, searchPageUrl);
    if (firstChallenge) {
      return { jobs: [], challengeRequired: firstChallenge };
    }

    const firstApiResponse = unwrapApiPageResult(await firstApiResponsePromise);
    const firstJobs = (await collectJobsFromResponse(firstApiResponse))
      .map((job) => mapNaukriJob(job as NaukriRawJob))
      .filter((job): job is CreateJobInput => job !== null);
    jobs.push(...firstJobs);
    params.onPage(1, firstJobs);

    for (let pageNo = 2; pageNo <= maxPages; pageNo += 1) {
      if (params.shouldCancel?.() || jobs.length >= params.maxJobsPerTerm) {
        break;
      }

      const apiResponsePromise = waitForApiPageResult({
        page,
        pageNo,
        timeoutMs: REQUEST_TIMEOUT_MS,
      });
      const clicked = await clickNextPage(page);
      if (!clicked) break;

      const apiResponse = unwrapApiPageResult(await apiResponsePromise);
      const challenge = await assertNoBlockingChallenge(page, page.url());
      if (challenge) {
        return { jobs: [], challengeRequired: challenge };
      }

      const pageJobs = (await collectJobsFromResponse(apiResponse))
        .map((job) => mapNaukriJob(job as NaukriRawJob))
        .filter((job): job is CreateJobInput => job !== null);
      jobs.push(...pageJobs);
      params.onPage(pageNo, pageJobs);

      await page.waitForTimeout(PAGE_DELAY_MS);
    }

    return { jobs: jobs.slice(0, params.maxJobsPerTerm) };
  } finally {
    await context.close();
  }
}

export async function runNaukri(
  options: RunNaukriOptions = {},
): Promise<NaukriResult> {
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const runLocations = resolveRunLocations(options.locations);
  const maxJobsPerTerm = resolveNaukriMaxJobsPerTerm(options.maxJobsPerTerm);
  const freshness = options.freshness ?? DEFAULT_FRESHNESS;
  const termTotal = searchTerms.length * runLocations.length;
  const allJobs: CreateJobInput[] = [];
  let runIndex = 0;
  let browser: Browser | undefined;
  let userAgent: string | undefined;

  try {
    const launched = await launchBrowser();
    browser = launched.browser;
    userAgent = launched.userAgent;

    for (const location of runLocations) {
      for (const searchTerm of searchTerms) {
        runIndex += 1;
        if (options.shouldCancel?.()) {
          return {
            success: true,
            jobs: dedupeNaukriJobs(allJobs, options.existingJobUrls),
          };
        }

        options.onProgress?.({
          type: "term_start",
          termIndex: runIndex,
          termTotal,
          searchTerm,
          location: location ?? undefined,
        });

        let totalCollected = 0;
        const result = await collectForTerm({
          browser,
          userAgent,
          searchTerm,
          location,
          maxJobsPerTerm,
          freshness,
          shouldCancel: options.shouldCancel,
          onPage: (pageNo, pageJobs) => {
            totalCollected += pageJobs.length;
            options.onProgress?.({
              type: "page_fetched",
              termIndex: runIndex,
              termTotal,
              searchTerm,
              location: location ?? undefined,
              pageNo,
              resultsOnPage: pageJobs.length,
              totalCollected,
            });
          },
        });

        if (result.challengeRequired) {
          return {
            success: false,
            jobs: [],
            challengeRequired: result.challengeRequired,
          };
        }

        allJobs.push(...result.jobs);
        options.onProgress?.({
          type: "term_complete",
          termIndex: runIndex,
          termTotal,
          searchTerm,
          location: location ?? undefined,
          jobsFoundTerm: result.jobs.length,
        });
      }
    }

    return {
      success: true,
      jobs: dedupeNaukriJobs(allJobs, options.existingJobUrls),
    };
  } catch (error) {
    return {
      success: false,
      jobs: [],
      error:
        error instanceof Error
          ? error.message
          : "Unexpected error while running Naukri extractor.",
    };
  } finally {
    await browser?.close();
  }
}
