/**
 * Service for running the UK Visa Jobs extractor (extractors/ukvisajobs).
 *
 * Spawns the extractor as a child process and reads its output dataset.
 */

import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { CreateJobInput } from "@shared/types";
import { toNumberOrNull, toStringOrNull } from "@shared/utils/type-conversion";

const __dirname = dirname(fileURLToPath(import.meta.url));
const UKVISAJOBS_DIR = join(__dirname, "../../../../extractors/ukvisajobs");
const STORAGE_DIR = join(UKVISAJOBS_DIR, "storage/datasets/default");
const AUTH_CACHE_PATH = join(UKVISAJOBS_DIR, "storage/ukvisajobs-auth.json");
const UKVISAJOBS_API_URL =
  "https://my.ukvisajobs.com/ukvisa-api/api/fetch-jobs-data";
const UKVISAJOBS_PAGE_SIZE = 15;
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";
let isUkVisaJobsRunning = false;

interface UkVisaJobsAuthSession {
  token?: string;
  authToken?: string;
  csrfToken?: string;
  ciSession?: string;
}

export interface RunUkVisaJobsOptions {
  /** Maximum number of jobs to fetch per search term. Defaults to 50, max 200. */
  maxJobs?: number;
  /** Search keyword filter (single) - legacy support */
  searchKeyword?: string;
  /** List of search terms to run sequentially */
  searchTerms?: string[];
  /** Optional callback for structured progress emitted by extractor runs. */
  onProgress?: (event: UkVisaJobsProgressEvent) => void;
}

export interface UkVisaJobsResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

type UkVisaJobsExtractorProgressEvent =
  | {
      type: "init";
      maxPages: number;
      maxJobs: number;
      searchKeyword: string;
    }
  | {
      type: "page_fetched";
      pageNo: number;
      maxPages: number;
      jobsOnPage: number;
      totalCollected: number;
      totalAvailable: number;
    }
  | {
      type: "done";
      maxPages: number;
      totalCollected: number;
      totalAvailable: number;
    }
  | {
      type: "empty_page";
      pageNo: number;
      maxPages: number;
      totalCollected: number;
    }
  | {
      type: "error";
      message: string;
      pageNo?: number;
      status?: number;
    };

type UkVisaJobsExtractorEventWithTerm = UkVisaJobsExtractorProgressEvent & {
  termIndex: number;
  termTotal: number;
  searchTerm: string;
};

export type UkVisaJobsProgressEvent =
  | UkVisaJobsExtractorEventWithTerm
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
      totalCollected: number;
    };

export function parseUkVisaJobsProgressLine(
  line: string,
): UkVisaJobsExtractorProgressEvent | null {
  if (!line.startsWith(JOBOPS_PROGRESS_PREFIX)) return null;
  const raw = line.slice(JOBOPS_PROGRESS_PREFIX.length).trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const event = toStringOrNull(parsed.event);
  if (!event) return null;

  if (event === "init") {
    const maxPages = toNumberOrNull(parsed.maxPages);
    const maxJobs = toNumberOrNull(parsed.maxJobs);
    if (maxPages === null || maxJobs === null) return null;
    return {
      type: "init",
      maxPages,
      maxJobs,
      searchKeyword: toStringOrNull(parsed.searchKeyword) ?? "",
    };
  }

  if (event === "page_fetched") {
    const pageNo = toNumberOrNull(parsed.pageNo);
    const maxPages = toNumberOrNull(parsed.maxPages);
    if (pageNo === null || maxPages === null) return null;
    return {
      type: "page_fetched",
      pageNo,
      maxPages,
      jobsOnPage: toNumberOrNull(parsed.jobsOnPage) ?? 0,
      totalCollected: toNumberOrNull(parsed.totalCollected) ?? 0,
      totalAvailable: toNumberOrNull(parsed.totalAvailable) ?? 0,
    };
  }

  if (event === "done") {
    const maxPages = toNumberOrNull(parsed.maxPages);
    if (maxPages === null) return null;
    return {
      type: "done",
      maxPages,
      totalCollected: toNumberOrNull(parsed.totalCollected) ?? 0,
      totalAvailable: toNumberOrNull(parsed.totalAvailable) ?? 0,
    };
  }

  if (event === "empty_page") {
    const pageNo = toNumberOrNull(parsed.pageNo);
    const maxPages = toNumberOrNull(parsed.maxPages);
    if (pageNo === null || maxPages === null) return null;
    return {
      type: "empty_page",
      pageNo,
      maxPages,
      totalCollected: toNumberOrNull(parsed.totalCollected) ?? 0,
    };
  }

  if (event === "error") {
    return {
      type: "error",
      message: toStringOrNull(parsed.message) ?? "unknown error",
      pageNo: toNumberOrNull(parsed.pageNo) ?? undefined,
      status: toNumberOrNull(parsed.status) ?? undefined,
    };
  }

  return null;
}

function buildCookieHeader(session: UkVisaJobsAuthSession): string {
  const cookieParts: string[] = [];
  if (session.csrfToken) cookieParts.push(`csrf_token=${session.csrfToken}`);
  if (session.ciSession) cookieParts.push(`ci_session=${session.ciSession}`);
  const token = session.authToken || session.token;
  if (token) cookieParts.push(`authToken=${token}`);
  return cookieParts.join("; ");
}

function buildVisaInfoDescription(raw: UkVisaJobsApiJob): string | undefined {
  const visaInfo: string[] = [];
  if (raw.visa_acceptance?.toLowerCase() === "yes")
    visaInfo.push("Visa acceptance: Yes");
  if (raw.applicants_outside_uk?.toLowerCase() === "yes")
    visaInfo.push("Accepts applicants outside UK");
  if (raw.likely_to_sponsor?.toLowerCase() === "yes")
    visaInfo.push("Likely to sponsor");
  if (raw.definitely_sponsored?.toLowerCase() === "yes")
    visaInfo.push("Definitely sponsored");
  if (raw.new_entrant?.toLowerCase() === "yes")
    visaInfo.push("New entrant friendly");
  if (raw.student_graduate?.toLowerCase() === "yes")
    visaInfo.push("Student/Graduate friendly");
  if (visaInfo.length === 0) return undefined;
  return `Visa sponsorship info: ${visaInfo.join(", ")}`;
}

function formatSalary(raw: UkVisaJobsApiJob): string | undefined {
  const minSalary = toNumberOrNull(raw.min_salary);
  const maxSalary = toNumberOrNull(raw.max_salary);
  const interval = toStringOrNull(raw.salary_interval);

  if (minSalary && maxSalary && maxSalary > 0) {
    return `GBP ${minSalary.toLocaleString()}-${maxSalary.toLocaleString()}${interval ? ` / ${interval}` : ""}`;
  }
  if (maxSalary && maxSalary > 0) {
    return `GBP ${maxSalary.toLocaleString()}${interval ? ` / ${interval}` : ""}`;
  }
  return undefined;
}

function mapApiJob(raw: UkVisaJobsApiJob): CreateJobInput {
  const description =
    toStringOrNull(raw.description) ?? buildVisaInfoDescription(raw);
  return {
    source: "ukvisajobs",
    sourceJobId: toStringOrNull(raw.id) ?? undefined,
    title: toStringOrNull(raw.title) ?? "Unknown Title",
    employer: toStringOrNull(raw.company_name) ?? "Unknown Employer",
    employerUrl: toStringOrNull(raw.company_link) ?? undefined,
    jobUrl: toStringOrNull(raw.job_link) ?? "",
    applicationLink: toStringOrNull(raw.job_link) ?? undefined,
    location: toStringOrNull(raw.city) ?? undefined,
    deadline: toStringOrNull(raw.job_expire) ?? undefined,
    salary: formatSalary(raw),
    jobDescription: description ?? undefined,
    datePosted: toStringOrNull(raw.created_date) ?? undefined,
    degreeRequired: toStringOrNull(raw.degree_requirement) ?? undefined,
    jobType: toStringOrNull(raw.job_type) ?? undefined,
    jobLevel: toStringOrNull(raw.job_level) ?? undefined,
  };
}

interface UkVisaJobsApiJob {
  id: string;
  title: string;
  company_name: string;
  company_link?: string;
  job_link: string;
  city?: string;
  created_date?: string;
  job_expire?: string;
  description?: string;
  min_salary?: string;
  max_salary?: string;
  salary_interval?: string;
  salary_method?: string;
  degree_requirement?: string;
  job_type?: string;
  job_level?: string;
  job_industry?: string;
  visa_acceptance?: string;
  applicants_outside_uk?: string;
  likely_to_sponsor?: string;
  definitely_sponsored?: string;
  new_entrant?: string;
  student_graduate?: string;
}

interface UkVisaJobsApiResponse {
  status: number;
  totalJobs: number;
  query?: string;
  jobs: UkVisaJobsApiJob[];
}

/**
 * Basic HTML to text conversion to extract job description.
 */
function cleanHtml(html: string): string {
  // Remove script, style tags and their content
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  // Try to extract content between <main> tags if present, or fallback to body
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (mainMatch) {
    text = mainMatch[1];
  } else if (bodyMatch) {
    text = bodyMatch[1];
  }

  // Remove remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Unescape common entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  // Limit length to avoid blowing up AI context
  if (text.length > 8000) {
    text = `${text.substring(0, 8000)}...`;
  }

  return text;
}

/**
 * Fetch job description from the job URL.
 */
async function fetchJobDescription(url: string): Promise<string | null> {
  try {
    console.log(`      Fetching description from ${url}...`);

    const authSession = await loadCachedAuthSession();
    const cookieParts: string[] = [];
    if (authSession?.csrfToken)
      cookieParts.push(`csrf_token=${authSession.csrfToken}`);
    if (authSession?.ciSession)
      cookieParts.push(`ci_session=${authSession.ciSession}`);
    const token = authSession?.authToken || authSession?.token;
    if (token) cookieParts.push(`authToken=${token}`);

    const headers: Record<string, string> = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };

    if (cookieParts.length > 0) {
      headers.Cookie = cookieParts.join("; ");
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) return null;

    const html = await response.text();
    const cleaned = cleanHtml(html);

    // If we only got a tiny bit of text, it might have failed
    return cleaned.length > 100 ? cleaned : null;
  } catch (error) {
    console.warn(
      `      âš ï¸ Failed to fetch description: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
    return null;
  }
}

async function loadCachedAuthSession(): Promise<UkVisaJobsAuthSession | null> {
  try {
    const data = await readFile(AUTH_CACHE_PATH, "utf-8");
    return JSON.parse(data) as UkVisaJobsAuthSession;
  } catch {
    return null;
  }
}

function getAuthToken(session: UkVisaJobsAuthSession | null): string | null {
  if (!session) return null;
  return session.authToken || session.token || null;
}

function hasAuthToken(
  session: UkVisaJobsAuthSession | null,
): session is UkVisaJobsAuthSession {
  return Boolean(session && (session.authToken || session.token));
}

function isAuthErrorResponse(status: number, bodyText: string): boolean {
  if (status === 401 || status === 403) return true;
  if (status !== 400) return false;
  try {
    const parsed = JSON.parse(bodyText) as {
      errorType?: string;
      message?: string;
    };
    if (parsed?.errorType === "expired") return true;
    if (parsed?.message?.toLowerCase().includes("expired")) return true;
  } catch {
    // Ignore parse errors
  }
  return bodyText.toLowerCase().includes("expired");
}

async function refreshUkVisaJobsAuthSession(): Promise<void> {
  const email = process.env.UKVISAJOBS_EMAIL;
  const password = process.env.UKVISAJOBS_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "UK Visa Jobs auth expired. Set UKVISAJOBS_EMAIL and UKVISAJOBS_PASSWORD to refresh.",
    );
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["tsx", "src/main.ts"], {
      cwd: UKVISAJOBS_DIR,
      stdio: "inherit",
      env: {
        ...process.env,
        UKVISAJOBS_REFRESH_ONLY: "1",
      },
    });

    child.on("close", (code) => {
      if (code === 0) resolve();
      else
        reject(new Error(`UK Visa Jobs auth refresh exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function loadAuthSessionOrRefresh(): Promise<UkVisaJobsAuthSession> {
  let authSession = await loadCachedAuthSession();
  if (hasAuthToken(authSession)) {
    return authSession;
  }

  await refreshUkVisaJobsAuthSession();

  authSession = await loadCachedAuthSession();
  if (!hasAuthToken(authSession)) {
    throw new Error(
      "UK Visa Jobs auth session missing. Set UKVISAJOBS_EMAIL and UKVISAJOBS_PASSWORD to refresh.",
    );
  }

  return authSession;
}

/**
 * Clear previous extraction results.
 */
async function clearStorageDataset(): Promise<void> {
  try {
    await rm(STORAGE_DIR, { recursive: true, force: true });
  } catch {
    // Ignore if directory doesn't exist
  }
}

export async function fetchUkVisaJobsPage(
  options: { searchKeyword?: string; page?: number } = {},
): Promise<{
  jobs: CreateJobInput[];
  totalJobs: number;
  page: number;
  pageSize: number;
}> {
  const page = options.page && options.page > 0 ? options.page : 1;
  let authSession = await loadAuthSessionOrRefresh();

  const fetchWithSession = async (session: UkVisaJobsAuthSession) => {
    const token = getAuthToken(session);
    if (!token) {
      throw new Error(
        "UK Visa Jobs auth session missing. Set UKVISAJOBS_EMAIL and UKVISAJOBS_PASSWORD to refresh.",
      );
    }

    const formData = new FormData();
    formData.append("is_global", "0");
    formData.append("sortBy", "desc");
    formData.append("pageNo", String(page));
    formData.append("visaAcceptance", "false");
    formData.append("applicants_outside_uk", "false");
    formData.append(
      "searchKeyword",
      options.searchKeyword ? options.searchKeyword : "null",
    );
    formData.append("token", token);

    const cookies = buildCookieHeader({
      token: session?.token,
      authToken: session?.authToken,
      csrfToken: session?.csrfToken,
      ciSession: session?.ciSession,
    });

    const response = await fetch(UKVISAJOBS_API_URL, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        cookie: cookies,
        origin: "https://my.ukvisajobs.com",
        referer: `https://my.ukvisajobs.com/open-jobs/1?is_global=0&sortBy=desc&pageNo=${page}&visaAcceptance=false&applicants_outside_uk=false`,
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      body: formData,
    });

    const text = await response.text();
    return { response, text };
  };

  let { response, text } = await fetchWithSession(authSession);

  if (!response.ok && isAuthErrorResponse(response.status, text)) {
    await refreshUkVisaJobsAuthSession();
    const refreshedSession = await loadCachedAuthSession();
    if (!hasAuthToken(refreshedSession)) {
      throw new Error(
        "UK Visa Jobs auth session missing. Set UKVISAJOBS_EMAIL and UKVISAJOBS_PASSWORD to refresh.",
      );
    }
    authSession = refreshedSession;
    ({ response, text } = await fetchWithSession(authSession));
  }

  if (!response.ok) {
    throw new Error(`UK Visa Jobs API returned ${response.status}: ${text}`);
  }

  let data: UkVisaJobsApiResponse;
  try {
    data = JSON.parse(text) as UkVisaJobsApiResponse;
  } catch (_error) {
    throw new Error("UK Visa Jobs API returned an invalid response.");
  }

  if (data.status !== 1) {
    throw new Error(`UK Visa Jobs API returned status ${data.status}`);
  }

  const jobs = (data.jobs || [])
    .map(mapApiJob)
    .filter((job) => Boolean(job.jobUrl));

  const totalJobs = Number.isFinite(data.totalJobs)
    ? data.totalJobs
    : jobs.length;

  return {
    jobs,
    totalJobs,
    page,
    pageSize: UKVISAJOBS_PAGE_SIZE,
  };
}

export async function runUkVisaJobs(
  options: RunUkVisaJobsOptions = {},
): Promise<UkVisaJobsResult> {
  if (isUkVisaJobsRunning) {
    return {
      success: false,
      jobs: [],
      error: "UK Visa Jobs extractor is already running",
    };
  }

  isUkVisaJobsRunning = true;
  try {
    console.log("ðŸ‡¬ðŸ‡§ Running UK Visa Jobs extractor...");

    // Determine terms to run
    const terms: string[] = [];
    if (options.searchTerms && options.searchTerms.length > 0) {
      terms.push(...options.searchTerms);
    } else if (options.searchKeyword) {
      terms.push(options.searchKeyword);
    } else {
      // No search terms = run once without keyword
      terms.push("");
    }

    const allJobs: CreateJobInput[] = [];
    const seenIds = new Set<string>();
    const termTotal = terms.length;

    for (let i = 0; i < terms.length; i++) {
      const term = terms[i];
      const termLabel = term ? `"${term}"` : "all jobs";
      const termIndex = i + 1;
      console.log(`   Running for ${termLabel}...`);

      try {
        // Clear previous results for this run
        await clearStorageDataset();
        await mkdir(STORAGE_DIR, { recursive: true });

        // Run the extractor
        await new Promise<void>((resolve, reject) => {
          const child = spawn("npx", ["tsx", "src/main.ts"], {
            cwd: UKVISAJOBS_DIR,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              ...process.env,
              JOBOPS_EMIT_PROGRESS: "1",
              UKVISAJOBS_MAX_JOBS: String(options.maxJobs ?? 50),
              UKVISAJOBS_SEARCH_KEYWORD: term,
            },
          });

          const handleLine = (line: string, stream: NodeJS.WriteStream) => {
            const progressEvent = parseUkVisaJobsProgressLine(line);
            if (progressEvent) {
              options.onProgress?.({
                ...progressEvent,
                termIndex,
                termTotal,
                searchTerm: term,
              });
              return;
            }
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
            if (code === 0) resolve();
            else
              reject(
                new Error(`UK Visa Jobs extractor exited with code ${code}`),
              );
          });
          child.on("error", reject);
        });

        // Read the output dataset and accumulate
        const runJobs = await readDataset();
        let newCount = 0;

        for (const job of runJobs) {
          // Deduplicate by sourceJobId or jobUrl
          const id = job.sourceJobId || job.jobUrl;
          if (!seenIds.has(id)) {
            seenIds.add(id);

            // Enrich description if missing or poor
            const isPoorDescription =
              !job.jobDescription ||
              job.jobDescription.length < 100 ||
              job.jobDescription.startsWith("Visa sponsorship info:");

            if (isPoorDescription && job.jobUrl) {
              const enriched = await fetchJobDescription(job.jobUrl);
              if (enriched) {
                job.jobDescription = enriched;
              }
              // Small delay to avoid hammering the server
              await new Promise((resolve) => setTimeout(resolve, 500));
            }

            allJobs.push(job);
            newCount++;
          }
        }

        console.log(
          `   âœ… Fetched ${runJobs.length} jobs for ${termLabel} (${newCount} new unique)`,
        );
        options.onProgress?.({
          type: "term_complete",
          termIndex,
          termTotal,
          searchTerm: term,
          jobsFoundTerm: newCount,
          totalCollected: allJobs.length,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`âŒ UK Visa Jobs failed for ${termLabel}: ${message}`);
        options.onProgress?.({
          type: "error",
          termIndex,
          termTotal,
          searchTerm: term,
          message,
        });
        // Continue to next term instead of failing completely
      }

      // Delay between terms
      if (i < terms.length - 1) {
        console.log("   Waiting 5s before next search term...");
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    console.log(
      `âœ… UK Visa Jobs: imported total ${allJobs.length} unique jobs`,
    );
    return { success: true, jobs: allJobs };
  } finally {
    isUkVisaJobsRunning = false;
  }
}

/**
 * Read jobs from the extractor's output dataset.
 */
async function readDataset(): Promise<CreateJobInput[]> {
  const jobs: CreateJobInput[] = [];

  try {
    const files = await readdir(STORAGE_DIR);
    const jsonFiles = files.filter(
      (f) => f.endsWith(".json") && f !== "jobs.json",
    );

    for (const file of jsonFiles.sort()) {
      try {
        const content = await readFile(join(STORAGE_DIR, file), "utf-8");
        const job = JSON.parse(content);

        // Map to CreateJobInput format
        jobs.push({
          source: "ukvisajobs",
          sourceJobId: job.sourceJobId,
          title: job.title || "Unknown Title",
          employer: job.employer || "Unknown Employer",
          employerUrl: job.employerUrl,
          jobUrl: job.jobUrl,
          applicationLink: job.applicationLink || job.jobUrl,
          location: job.location,
          deadline: job.deadline,
          salary: job.salary,
          jobDescription: job.jobDescription,
          datePosted: job.datePosted,
          degreeRequired: job.degreeRequired,
          jobType: job.jobType,
          jobLevel: job.jobLevel,
        });
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Dataset directory doesn't exist yet
  }

  return jobs;
}
