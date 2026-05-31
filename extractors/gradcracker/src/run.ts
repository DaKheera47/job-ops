import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  createPersistedFetchCookieJar,
  getCloudflareCookieStorageDir,
} from "browser-utils";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { Impit } from "impit";

type CreateJobInput = {
  source: "gradcracker";
  title: string;
  employer: string;
  jobUrl: string;
  employerUrl?: string;
  applicationLink?: string;
  disciplines?: string;
  deadline?: string;
  salary?: string;
  location?: string;
  degreeRequired?: string;
  starting?: string;
  jobDescription?: string;
};

const srcDir = dirname(fileURLToPath(import.meta.url));
const EXTRACTOR_DIR = join(srcDir, "..");
const STORAGE_DIR = join(EXTRACTOR_DIR, "storage/datasets/default");
const JOBOPS_STORAGE_DIR = join(EXTRACTOR_DIR, "storage/jobops");
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";
const EXTRACTOR_ID = "gradcracker";
const GRADCRACKER_BASE_URL = "https://www.gradcracker.com";
const DEFAULT_DETAIL_CONCURRENCY = 2;
const DEFAULT_REQUEST_DELAY_MS = 1_000;

const LOCATIONS = [
  "london-and-south-east",
  "north-west",
  "yorkshire",
  "east-midlands",
  "west-midlands",
  "south-west",
] as const;

const DEFAULT_ROLES = ["web-development", "software-systems"] as const;

const CF_CHALLENGE_MARKERS = [
  "cf-challenge-running",
  "cf-turnstile",
  "Checking your browser",
  "challenges.cloudflare.com",
  "Just a moment...",
  "cf-please-wait",
  "cf_chl_opt",
] as const;

export interface CrawlerResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
  /** URL that needs a human to solve a Cloudflare challenge in a headed browser */
  challengeRequired?: string;
}

export interface RunCrawlerOptions {
  existingJobUrls?: string[];
  onProgress?: (update: JobExtractorProgress) => void;
  shouldCancel?: () => boolean;
  searchTerms?: string[];
  maxJobsPerTerm?: number;
  fetchImpl?: FetchLike;
  browserFallback?: boolean;
  detailConcurrency?: number;
  requestDelayMs?: number;
}

interface JobExtractorProgress {
  phase?: "list" | "job";
  currentUrl?: string;
  listPagesProcessed?: number;
  listPagesTotal?: number;
  jobCardsFound?: number;
  jobPagesEnqueued?: number;
  jobPagesSkipped?: number;
  jobPagesProcessed?: number;
  detail?: string;
  ts?: string;
}

type GradcrackerChildProgressEvent =
  | { type: "challenge_required"; url: string }
  | { type: "progress"; progress: JobExtractorProgress };

const CHILD_OUTPUT_HISTORY_LIMIT = 40;

export interface GradcrackerJobSummary {
  title: string;
  jobUrl: string;
  employer: string;
  employerUrl?: string;
  disciplines?: string;
  deadline?: string;
  salary?: string;
  location?: string;
  degreeRequired?: string;
  starting?: string;
  role: string;
}

interface GradcrackerJobDetail {
  applicationLink?: string;
  jobDescription?: string;
}

type FetchResponseLike = {
  ok: boolean;
  status: number;
  statusText?: string;
  url?: string;
  headers?: Headers;
  text: () => Promise<string>;
};

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<FetchResponseLike>;

class ChallengeRequiredError extends Error {
  constructor(readonly url: string) {
    super(`Cloudflare challenge required for ${url}`);
  }
}

export function parseGradcrackerProgressLine(
  line: string,
): GradcrackerChildProgressEvent | null {
  if (!line.startsWith(JOBOPS_PROGRESS_PREFIX)) return null;

  const raw = line.slice(JOBOPS_PROGRESS_PREFIX.length).trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (
    parsed.event === "challenge_required" &&
    typeof parsed.url === "string" &&
    parsed.url.length > 0
  ) {
    return { type: "challenge_required", url: parsed.url };
  }

  return {
    type: "progress",
    progress: parsed as JobExtractorProgress,
  };
}

function rememberChildOutputLine(lines: string[], line: string): void {
  const cleaned = line.replace(/\s+/g, " ").trim();
  if (!cleaned) return;
  lines.push(cleaned);
  if (lines.length > CHILD_OUTPUT_HISTORY_LIMIT) {
    lines.splice(0, lines.length - CHILD_OUTPUT_HISTORY_LIMIT);
  }
}

export function summarizeGradcrackerBrowserFailure(
  lines: string[],
  fallbackMessage: string,
): string {
  const combined = lines.join("\n");
  const missingExecutable = /Executable doesn't exist at ([^\n]+)/.exec(
    combined,
  );
  const failedLaunch = /Failed to launch browser/i.test(combined);

  if (missingExecutable || failedLaunch) {
    const path = missingExecutable?.[1]?.trim();
    return [
      "Gradcracker browser fallback could not launch Playwright Firefox.",
      path ? `Missing executable: ${path}.` : undefined,
      "Rebuild the Docker image so the Node Playwright browser binary is installed, or run `npx playwright install firefox` in the runtime image.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  const meaningfulLine = [...lines]
    .reverse()
    .find(
      (line) =>
        !line.startsWith("INFO  PlaywrightCrawler") && !line.startsWith("> "),
    );

  return meaningfulLine
    ? `Gradcracker browser fallback failed: ${meaningfulLine}`
    : fallbackMessage;
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

function toNonNegativeIntOrFallback(
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
  return Math.max(0, Math.floor(parsed));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRequestStartLimiter(minIntervalMs: number): () => Promise<void> {
  if (minIntervalMs <= 0) return async () => {};

  let nextStartAt = 0;
  let queue = Promise.resolve();

  return async () => {
    const previous = queue;
    let releaseQueue!: () => void;
    queue = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });

    await previous;
    try {
      const waitMs = Math.max(0, nextStartAt - Date.now());
      if (waitMs > 0) {
        await sleep(waitMs);
      }
      nextStartAt = Date.now() + minIntervalMs;
    } finally {
      releaseQueue();
    }
  };
}

function createPacedFetch(
  fetchImpl: FetchLike,
  requestDelayMs: number,
): FetchLike {
  const waitForRequestTurn = createRequestStartLimiter(requestDelayMs);

  return async (input, init) => {
    await waitForRequestTurn();
    return fetchImpl(input, init);
  };
}

function normalizeSearchRole(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveRoles(searchTerms: string[] | undefined): string[] {
  if (!searchTerms || searchTerms.length === 0) return [...DEFAULT_ROLES];

  const roles = searchTerms.map(normalizeSearchRole).filter(Boolean);
  return roles.length > 0 ? roles : [...DEFAULT_ROLES];
}

function buildSearchUrl(location: string, role: string): string {
  return `${GRADCRACKER_BASE_URL}/search/computing-technology/${role}-graduate-jobs-in-${location}?order=dateAdded`;
}

function normalizeUrl(
  raw: string | null | undefined,
  baseUrl = GRADCRACKER_BASE_URL,
): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, baseUrl);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return raw.replace(/\/$/, "");
  }
}

function toAbsoluteUrl(
  raw: string | null | undefined,
  baseUrl: string,
): string {
  if (!raw) return "";
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return raw;
  }
}

function cleanInlineText(value: string | null | undefined): string | undefined {
  const cleaned = value?.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}

function cleanMultilineText(
  value: string | null | undefined,
): string | undefined {
  const cleaned = value
    ?.replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");

  return cleaned || undefined;
}

function hasChallengeMarkers(html: string): boolean {
  return CF_CHALLENGE_MARKERS.some((marker) => html.includes(marker));
}

function isChallengeResponse(
  response: FetchResponseLike,
  html: string,
): boolean {
  const mitigated = response.headers?.get("cf-mitigated")?.toLowerCase();
  if (mitigated === "challenge") return true;
  if (
    (response.status === 403 || response.status === 503) &&
    hasChallengeMarkers(html)
  ) {
    return true;
  }
  return hasChallengeMarkers(html);
}

function getDdText(
  $: cheerio.CheerioAPI,
  article: cheerio.Cheerio<Element>,
  label: string,
): string | undefined {
  const dt = article
    .find("dt")
    .filter((_, element) => cleanInlineText($(element).text()) === label)
    .first();
  if (dt.length === 0) return undefined;
  return cleanInlineText(dt.next("dd").text());
}

function extractDeadline(
  $: cheerio.CheerioAPI,
  article: cheerio.Cheerio<Element>,
): string | undefined {
  const deadlineText = article
    .find("div")
    .map((_, element) => cleanInlineText($(element).text()) ?? "")
    .get()
    .find((text) => text.startsWith("Deadline:"));

  return deadlineText?.replace(/^Deadline:\s*/i, "").trim() || undefined;
}

export function parseGradcrackerListPage(
  html: string,
  pageUrl: string,
  role = "",
): GradcrackerJobSummary[] {
  const $ = cheerio.load(html);

  return $("article[wire\\:key]")
    .map((_, element) => {
      const article = $(element);
      const titleAnchor = article.find("h2 a").first();
      const title = cleanInlineText(titleAnchor.text());
      const jobUrl = normalizeUrl(titleAnchor.attr("href"), pageUrl);
      if (!title || !jobUrl) return null;

      const employer =
        cleanInlineText(article.find("figure img").first().attr("alt")) ??
        "Unknown Employer";
      const employerUrl = normalizeUrl(
        article.find("figure a").first().attr("href"),
        pageUrl,
      );

      return {
        title,
        jobUrl,
        employer,
        ...(employerUrl ? { employerUrl } : {}),
        ...(cleanInlineText(article.find("h3").first().text())
          ? { disciplines: cleanInlineText(article.find("h3").first().text()) }
          : {}),
        ...(extractDeadline($, article)
          ? { deadline: extractDeadline($, article) }
          : {}),
        ...(getDdText($, article, "Salary")
          ? { salary: getDdText($, article, "Salary") }
          : {}),
        ...(getDdText($, article, "Location")
          ? { location: getDdText($, article, "Location") }
          : {}),
        ...(getDdText($, article, "Degree required")
          ? { degreeRequired: getDdText($, article, "Degree required") }
          : {}),
        ...(getDdText($, article, "Starting")
          ? { starting: getDdText($, article, "Starting") }
          : {}),
        role,
      };
    })
    .get()
    .filter((job): job is GradcrackerJobSummary => job !== null);
}

function decodeRepeatedly(value: string): string {
  let decoded = value;
  for (let i = 0; i < 3; i += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

export function decodeGradcrackerOutUrl(value: string): string | undefined {
  try {
    const url = new URL(value, GRADCRACKER_BASE_URL);
    if (
      url.hostname !== "www.gradcracker.com" ||
      (url.pathname !== "/out" && !url.pathname.startsWith("/out/"))
    ) {
      return url.href;
    }

    const target = url.searchParams.get("u");
    if (!target) return url.href;

    return decodeRepeatedly(target);
  } catch {
    return undefined;
  }
}

export function parseGradcrackerDetailPage(
  html: string,
  pageUrl: string,
): GradcrackerJobDetail {
  const $ = cheerio.load(html);
  const jobDescription = cleanMultilineText($(".body-content").first().text());
  const applyHref =
    $("a[dusk='apply-button']").first().attr("href") ??
    $("a[href*='/out/']").first().attr("href") ??
    $("a")
      .filter((_, element) =>
        /apply/i.test(cleanInlineText($(element).text()) ?? ""),
      )
      .first()
      .attr("href");

  const applicationLink = applyHref
    ? decodeGradcrackerOutUrl(toAbsoluteUrl(applyHref, pageUrl))
    : undefined;

  return {
    ...(applicationLink ? { applicationLink } : {}),
    ...(jobDescription ? { jobDescription } : {}),
  };
}

async function createImpitFetch(): Promise<FetchLike> {
  const persistedCookies = await createPersistedFetchCookieJar(
    EXTRACTOR_ID,
    getCloudflareCookieStorageDir(),
  );
  const headers = persistedCookies.userAgent
    ? { "user-agent": persistedCookies.userAgent }
    : undefined;
  const impit = new Impit({
    browser: "firefox",
    timeout: 30_000,
    cookieJar: persistedCookies.cookieJar,
    ...(headers ? { headers } : {}),
  });

  return (input, init) =>
    impit.fetch(input, init as Parameters<Impit["fetch"]>[1]);
}

async function fetchHtml(args: {
  fetchImpl: FetchLike;
  url: string;
}): Promise<string> {
  const response = await args.fetchImpl(args.url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.9",
    },
  });
  const html = await response.text();

  if (isChallengeResponse(response, html)) {
    throw new ChallengeRequiredError(args.url);
  }

  if (!response.ok) {
    throw new Error(
      `Gradcracker request failed with ${response.status} ${response.statusText ?? ""}`.trim(),
    );
  }

  return html;
}

function createProgressTracker(args: {
  listPagesTotal: number;
  onProgress?: (update: JobExtractorProgress) => void;
}) {
  const state: Required<
    Pick<
      JobExtractorProgress,
      | "listPagesProcessed"
      | "jobCardsFound"
      | "jobPagesEnqueued"
      | "jobPagesSkipped"
      | "jobPagesProcessed"
    >
  > &
    Pick<JobExtractorProgress, "phase" | "currentUrl" | "listPagesTotal"> = {
    phase: "list",
    listPagesProcessed: 0,
    listPagesTotal: args.listPagesTotal,
    jobCardsFound: 0,
    jobPagesEnqueued: 0,
    jobPagesSkipped: 0,
    jobPagesProcessed: 0,
  };

  const emit = () => {
    args.onProgress?.({
      ...state,
      ts: new Date().toISOString(),
    });
  };

  return {
    init() {
      emit();
    },
    markListPageDone(params: {
      currentUrl: string;
      jobCardsFound: number;
      jobPagesEnqueued: number;
      jobPagesSkipped: number;
    }) {
      state.phase = "list";
      state.currentUrl = params.currentUrl;
      state.listPagesProcessed += 1;
      state.jobCardsFound += params.jobCardsFound;
      state.jobPagesEnqueued += params.jobPagesEnqueued;
      state.jobPagesSkipped += params.jobPagesSkipped;
      emit();
    },
    markJobPageDone(currentUrl: string) {
      state.phase = "job";
      state.currentUrl = currentUrl;
      state.jobPagesProcessed += 1;
      emit();
    },
  };
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  callback: (value: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await callback(values[currentIndex]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}

export async function runHttpCrawler(
  options: RunCrawlerOptions = {},
): Promise<CrawlerResult> {
  const rawFetchImpl = options.fetchImpl ?? (await createImpitFetch());
  const requestDelayMs = toNonNegativeIntOrFallback(
    options.requestDelayMs ??
      process.env.GRADCRACKER_HTTP_REQUEST_DELAY_MS ??
      (options.fetchImpl ? 0 : DEFAULT_REQUEST_DELAY_MS),
    DEFAULT_REQUEST_DELAY_MS,
  );
  const fetchImpl = createPacedFetch(rawFetchImpl, requestDelayMs);
  const roles = resolveRoles(options.searchTerms);
  const maxJobsPerTerm = toPositiveIntOrFallback(options.maxJobsPerTerm, 50);
  const existingJobUrls = new Set(
    (options.existingJobUrls ?? [])
      .map((url) => normalizeUrl(url))
      .filter((url): url is string => Boolean(url)),
  );
  const detailConcurrency = toPositiveIntOrFallback(
    options.detailConcurrency ??
      process.env.GRADCRACKER_HTTP_DETAIL_CONCURRENCY,
    DEFAULT_DETAIL_CONCURRENCY,
  );
  const startUrls = LOCATIONS.flatMap((location) =>
    roles.map((role) => ({
      role,
      url: buildSearchUrl(location, role),
    })),
  );
  const progress = createProgressTracker({
    listPagesTotal: startUrls.length,
    onProgress: options.onProgress,
  });

  progress.init();

  try {
    const seen = new Set<string>();
    const termCounts = new Map<string, number>();
    const pendingDetails: GradcrackerJobSummary[] = [];

    for (const startUrl of startUrls) {
      if (options.shouldCancel?.()) {
        return { success: true, jobs: [] };
      }

      const currentTermCount = termCounts.get(startUrl.role) ?? 0;
      if (currentTermCount >= maxJobsPerTerm) {
        progress.markListPageDone({
          currentUrl: startUrl.url,
          jobCardsFound: 0,
          jobPagesEnqueued: 0,
          jobPagesSkipped: 0,
        });
        continue;
      }

      const html = await fetchHtml({ fetchImpl, url: startUrl.url });
      const summaries = parseGradcrackerListPage(
        html,
        startUrl.url,
        startUrl.role,
      );
      let enqueued = 0;
      let skippedKnown = 0;

      for (const summary of summaries) {
        if ((termCounts.get(startUrl.role) ?? 0) >= maxJobsPerTerm) {
          break;
        }

        const normalizedJobUrl = normalizeUrl(summary.jobUrl);
        if (!normalizedJobUrl) continue;

        if (existingJobUrls.has(normalizedJobUrl)) {
          skippedKnown += 1;
          continue;
        }

        if (seen.has(normalizedJobUrl)) continue;
        seen.add(normalizedJobUrl);
        pendingDetails.push(summary);
        enqueued += 1;
        termCounts.set(startUrl.role, (termCounts.get(startUrl.role) ?? 0) + 1);
      }

      progress.markListPageDone({
        currentUrl: startUrl.url,
        jobCardsFound: summaries.length,
        jobPagesEnqueued: enqueued,
        jobPagesSkipped: skippedKnown,
      });
    }

    const jobs = await mapWithConcurrency(
      pendingDetails,
      detailConcurrency,
      async (summary) => {
        if (options.shouldCancel?.()) {
          return null;
        }

        const html = await fetchHtml({ fetchImpl, url: summary.jobUrl });
        const detail = parseGradcrackerDetailPage(html, summary.jobUrl);
        progress.markJobPageDone(summary.jobUrl);

        const job: CreateJobInput = {
          source: "gradcracker",
          title: summary.title,
          employer: summary.employer,
          jobUrl: summary.jobUrl,
        };
        if (summary.employerUrl) job.employerUrl = summary.employerUrl;
        if (detail.applicationLink)
          job.applicationLink = detail.applicationLink;
        if (summary.disciplines) job.disciplines = summary.disciplines;
        if (summary.deadline) job.deadline = summary.deadline;
        if (summary.salary) job.salary = summary.salary;
        if (summary.location) job.location = summary.location;
        if (summary.degreeRequired) job.degreeRequired = summary.degreeRequired;
        if (summary.starting) job.starting = summary.starting;
        if (detail.jobDescription) job.jobDescription = detail.jobDescription;
        return job;
      },
    );

    return {
      success: true,
      jobs: jobs.filter((job): job is CreateJobInput => job !== null),
    };
  } catch (error) {
    if (error instanceof ChallengeRequiredError) {
      return { success: false, jobs: [], challengeRequired: error.url };
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unexpected error while running Gradcracker HTTP scraper.";

    return { success: false, jobs: [], error: message };
  }
}

async function writeExistingJobUrlsFile(
  existingJobUrls: string[] | undefined,
): Promise<string | null> {
  if (!existingJobUrls || existingJobUrls.length === 0) return null;
  await mkdir(JOBOPS_STORAGE_DIR, { recursive: true });
  const filePath = join(JOBOPS_STORAGE_DIR, "existing-job-urls.json");
  await writeFile(filePath, JSON.stringify(existingJobUrls), "utf-8");
  return filePath;
}

async function runBrowserCrawler(
  options: RunCrawlerOptions = {},
): Promise<CrawlerResult> {
  let challengeRequired: string | undefined;
  const childOutputLines: string[] = [];

  try {
    await clearStorageDataset();
    const existingJobUrlsFile = await writeExistingJobUrlsFile(
      options.existingJobUrls,
    );

    await new Promise<void>((resolve, reject) => {
      const child = spawn("npm", ["run", "start"], {
        cwd: EXTRACTOR_DIR,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          JOBOPS_SKIP_APPLY_FOR_EXISTING: "1",
          JOBOPS_EMIT_PROGRESS: "1",
          GRADCRACKER_SEARCH_TERMS: options.searchTerms
            ? JSON.stringify(options.searchTerms)
            : "",
          GRADCRACKER_MAX_JOBS_PER_TERM: options.maxJobsPerTerm
            ? String(options.maxJobsPerTerm)
            : "",
          ...(existingJobUrlsFile
            ? { JOBOPS_EXISTING_JOB_URLS_FILE: existingJobUrlsFile }
            : {}),
        },
      });

      let settled = false;
      const failForChallenge = (url: string) => {
        if (settled) return;
        settled = true;
        challengeRequired = url;
        options.onProgress?.({
          currentUrl: url,
          detail: `Gradcracker hit a Cloudflare challenge: ${url}`,
          ts: new Date().toISOString(),
        });
        child.kill("SIGTERM");
        reject(new ChallengeRequiredError(url));
      };

      const handleLine = (line: string, stream: NodeJS.WriteStream) => {
        if (settled) return;

        const progressEvent = parseGradcrackerProgressLine(line);
        if (progressEvent) {
          if (progressEvent.type === "challenge_required") {
            failForChallenge(progressEvent.url);
            return;
          }
          options.onProgress?.(progressEvent.progress);
          return;
        }

        if (line.startsWith(JOBOPS_PROGRESS_PREFIX)) return;
        rememberChildOutputLine(childOutputLines, line);
        stream.write(`${line}\n`);
      };

      const stdoutRl = child.stdout
        ? createInterface({ input: child.stdout })
        : null;
      const stderrRl = child.stderr
        ? createInterface({ input: child.stderr })
        : null;

      stdoutRl?.on("line", (line) => handleLine(line, process.stdout));
      stderrRl?.on("line", (line) => handleLine(line, process.stderr));

      child.on("close", (code) => {
        stdoutRl?.close();
        stderrRl?.close();
        if (settled) return;
        settled = true;
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              summarizeGradcrackerBrowserFailure(
                childOutputLines,
                `Gradcracker browser crawler exited with code ${code}`,
              ),
            ),
          );
        }
      });

      child.on("error", (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      });
    });

    const jobs = await readCrawledJobs();
    if (challengeRequired && jobs.length === 0) {
      return { success: false, jobs: [], challengeRequired };
    }
    return { success: true, jobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, jobs: [], error: message, challengeRequired };
  }
}

export async function runCrawler(
  options: RunCrawlerOptions = {},
): Promise<CrawlerResult> {
  if (process.env.GRADCRACKER_FORCE_BROWSER === "1") {
    return runBrowserCrawler(options);
  }

  const httpResult = await runHttpCrawler(options);
  const shouldFallback =
    options.browserFallback !== false &&
    !options.fetchImpl &&
    !httpResult.success &&
    process.env.GRADCRACKER_DISABLE_BROWSER_FALLBACK !== "1";

  if (!shouldFallback) return httpResult;

  const browserResult = await runBrowserCrawler(options);
  if (browserResult.success) return browserResult;

  if (httpResult.challengeRequired && browserResult.error) {
    return {
      ...httpResult,
      error: httpResult.error
        ? `${httpResult.error}; ${browserResult.error}`
        : browserResult.error,
    };
  }

  return browserResult.error || browserResult.challengeRequired
    ? browserResult
    : httpResult;
}

async function readCrawledJobs(): Promise<CreateJobInput[]> {
  try {
    const files = await readdir(STORAGE_DIR);
    const jsonFiles = files.filter((file) => file.endsWith(".json"));
    const jobs: CreateJobInput[] = [];

    for (const file of jsonFiles) {
      const content = await readFile(join(STORAGE_DIR, file), "utf-8");
      const data = JSON.parse(content) as Record<string, unknown>;

      jobs.push({
        source: "gradcracker",
        title: (data.title as string) || "Unknown Title",
        employer: (data.employer as string) || "Unknown Employer",
        employerUrl: data.employerUrl as string | undefined,
        jobUrl: (data.url as string) || (data.jobUrl as string),
        applicationLink: data.applicationLink as string | undefined,
        disciplines:
          typeof data.disciplines === "string"
            ? data.disciplines
            : Array.isArray(data.disciplines)
              ? data.disciplines
                  .filter((value): value is string => typeof value === "string")
                  .join(", ")
              : undefined,
        deadline: data.deadline as string | undefined,
        salary: data.salary as string | undefined,
        location: data.location as string | undefined,
        degreeRequired: data.degreeRequired as string | undefined,
        starting: data.starting as string | undefined,
        jobDescription: data.jobDescription as string | undefined,
      });
    }

    return jobs;
  } catch {
    return [];
  }
}

async function clearStorageDataset(): Promise<void> {
  try {
    await rm(STORAGE_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}
