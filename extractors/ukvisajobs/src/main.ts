/**
 * UK Visa Jobs Extractor
 *
 * Fetches job listings from my.ukvisajobs.com that may sponsor work visas.
 * Outputs JSON to stdout for the orchestrator to consume.
 *
 * Environment variables:
 *   UKVISAJOBS_EMAIL - Login email for auto-refresh
 *   UKVISAJOBS_PASSWORD - Login password for auto-refresh
 *   UKVISAJOBS_HEADLESS - Set to "false" to show the browser (default: true)
 *   UKVISAJOBS_MAX_JOBS - Maximum jobs to fetch (default: 50, max: 200) - Set via UI Settings
 *   UKVISAJOBS_SEARCH_KEYWORD - Optional search filter
 *   UKVISAJOBS_REFRESH_ONLY - Set to "1" to refresh tokens and exit
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  toNumberOrNull,
  toStringOrNull,
} from "job-ops-shared/utils/type-conversion";
import type { Request } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));

const API_URL = "https://my.ukvisajobs.com/ukvisa-api/api/fetch-jobs-data";
const SIGNIN_URL = "https://my.ukvisajobs.com/signin";
const OPEN_JOBS_URL =
  "https://my.ukvisajobs.com/open-jobs/1?is_global=0&sortBy=desc&visaAcceptance=false&applicants_outside_uk=false&pageNo=1";
const AUTH_CACHE_PATH = join(__dirname, "../storage/ukvisajobs-auth.json");
const JOBS_PER_PAGE = 15;
const DEFAULT_MAX_JOBS = 50;
const MAX_ALLOWED_JOBS = 200;
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";

function emitProgress(
  event: string,
  payload: Record<string, unknown> = {},
): void {
  if (process.env.JOBOPS_EMIT_PROGRESS !== "1") return;
  const serialized = JSON.stringify({ event, ...payload });
  process.stdout.write(`${JOBOPS_PROGRESS_PREFIX}${serialized}\n`);
}

interface UkVisaJobsApiJob {
  id: string;
  title: string;
  company_name: string;
  company_link?: string;
  job_link: string;
  city: string;
  created_date: string;
  job_expire: string;
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
  image?: string;
  computed_cos_total?: string;
}

interface UkVisaJobsApiResponse {
  status: number;
  totalJobs: number;
  query?: string;
  jobs: UkVisaJobsApiJob[];
}

interface ExtractedJob {
  source: "ukvisajobs";
  sourceJobId: string;
  title: string;
  employer: string;
  employerUrl?: string;
  jobUrl: string;
  applicationLink: string;
  location?: string;
  deadline?: string;
  salary?: string;
  jobDescription?: string;
  datePosted?: string;
  degreeRequired?: string;
  jobType?: string;
  jobLevel?: string;
}

interface UkVisaJobsAuthSession {
  token: string;
  authToken: string;
  csrfToken: string;
  ciSession: string;
  fetchedAt: string;
  source: "cache" | "browser";
}

class UkVisaJobsAuthError extends Error {
  status: number;
  responseText: string;

  constructor(message: string, status: number, responseText: string) {
    super(message);
    this.name = "UkVisaJobsAuthError";
    this.status = status;
    this.responseText = responseText;
  }
}

async function fetchPage(
  pageNo: number,
  session: UkVisaJobsAuthSession,
  options: { searchKeyword?: string } = {},
): Promise<UkVisaJobsApiResponse> {
  // Use native FormData API (Node.js 18+)
  const formData = new FormData();
  formData.append("is_global", "0");
  formData.append("sortBy", "desc");
  formData.append("pageNo", String(pageNo));
  formData.append("visaAcceptance", "false");
  formData.append("applicants_outside_uk", "false");
  formData.append("searchKeyword", options.searchKeyword || "null");
  formData.append("token", session.token);

  const cookies = buildCookieHeader(session);

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      accept: "application/json, text/plain, */*",
      "accept-language": "en-US,en;q=0.9",
      cookie: cookies,
      origin: "https://my.ukvisajobs.com",
      referer: `https://my.ukvisajobs.com/open-jobs/1?is_global=0&sortBy=desc&pageNo=${pageNo}&visaAcceptance=false&applicants_outside_uk=false`,
      "user-agent":
        "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
    },
    body: formData,
  });

  if (!response.ok) {
    const text = await response.text();
    if (isAuthErrorResponse(response.status, text)) {
      throw new UkVisaJobsAuthError(
        `UKVisaJobs API returned ${response.status}: ${response.statusText} - ${text}`,
        response.status,
        text,
      );
    }
    throw new Error(
      `UKVisaJobs API returned ${response.status}: ${response.statusText} - ${text}`,
    );
  }

  return response.json() as Promise<UkVisaJobsApiResponse>;
}

function mapJob(raw: UkVisaJobsApiJob): ExtractedJob {
  // Build salary string from min/max
  let salary: string | undefined;
  const minSalary = toNumberOrNull(raw.min_salary);
  const maxSalary = toNumberOrNull(raw.max_salary);

  if (
    minSalary !== null &&
    minSalary > 0 &&
    maxSalary !== null &&
    maxSalary > 0
  ) {
    salary = `Â£${minSalary.toLocaleString()}-${maxSalary.toLocaleString()}`;
    if (raw.salary_interval) {
      salary += ` / ${raw.salary_interval}`;
    }
  } else if (maxSalary !== null && maxSalary > 0) {
    salary = `Â£${maxSalary.toLocaleString()}`;
    if (raw.salary_interval) {
      salary += ` / ${raw.salary_interval}`;
    }
  }

  // Build a description from visa sponsorship fields
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

  const description = raw.description
    ? raw.description
    : visaInfo.length > 0
      ? `Visa sponsorship info: ${visaInfo.join(", ")}`
      : undefined;

  return {
    source: "ukvisajobs",
    sourceJobId: raw.id,
    title: raw.title || "Unknown Title",
    employer: raw.company_name || "Unknown Employer",
    employerUrl: toStringOrNull(raw.company_link) ?? undefined,
    jobUrl: raw.job_link,
    applicationLink: raw.job_link,
    location: raw.city || undefined,
    deadline: raw.job_expire || undefined,
    salary,
    jobDescription: description,
    datePosted: raw.created_date || undefined,
    degreeRequired: toStringOrNull(raw.degree_requirement) ?? undefined,
    jobType: toStringOrNull(raw.job_type) ?? undefined,
    jobLevel: toStringOrNull(raw.job_level) ?? undefined,
  };
}

function buildCookieHeader(session: UkVisaJobsAuthSession): string {
  const cookieParts: string[] = [];
  if (session.csrfToken) cookieParts.push(`csrf_token=${session.csrfToken}`);
  if (session.ciSession) cookieParts.push(`ci_session=${session.ciSession}`);
  if (session.authToken) cookieParts.push(`authToken=${session.authToken}`);
  return cookieParts.join("; ");
}

function getLoginCredentials(): { email: string; password: string } | null {
  const email = process.env.UKVISAJOBS_EMAIL;
  const password = process.env.UKVISAJOBS_PASSWORD;
  if (!email || !password) return null;
  return { email, password };
}

async function loadCachedAuthSession(): Promise<UkVisaJobsAuthSession | null> {
  try {
    const data = await readFile(AUTH_CACHE_PATH, "utf8");
    const parsed = JSON.parse(data) as UkVisaJobsAuthSession;
    if (!parsed?.token) return null;
    return {
      token: parsed.token,
      authToken: parsed.authToken || parsed.token,
      csrfToken: parsed.csrfToken || "",
      ciSession: parsed.ciSession || "",
      fetchedAt: parsed.fetchedAt || new Date().toISOString(),
      source: "cache",
    };
  } catch (_error) {
    return null;
  }
}

async function saveCachedAuthSession(
  session: UkVisaJobsAuthSession,
): Promise<void> {
  const payload = {
    token: session.token,
    authToken: session.authToken,
    csrfToken: session.csrfToken,
    ciSession: session.ciSession,
    fetchedAt: session.fetchedAt,
    source: session.source,
  };
  await mkdir(dirname(AUTH_CACHE_PATH), { recursive: true });
  await writeFile(AUTH_CACHE_PATH, JSON.stringify(payload, null, 2));
}

function extractMultipartField(body: string, field: string): string | null {
  const nameToken = `name="${field}"`;
  const index = body.indexOf(nameToken);
  if (index === -1) return null;

  const afterName = body.slice(index + nameToken.length);
  let separatorIndex = afterName.indexOf("\r\n\r\n");
  let separatorLength = 4;
  if (separatorIndex === -1) {
    separatorIndex = afterName.indexOf("\n\n");
    separatorLength = 2;
  }
  if (separatorIndex === -1) return null;

  const valueStart =
    index + nameToken.length + separatorIndex + separatorLength;
  const remainder = body.slice(valueStart);
  const endIndex = remainder.indexOf("\r\n");
  if (endIndex === -1) return remainder.trim();
  return remainder.slice(0, endIndex).trim();
}

function extractTokenFromRequest(request: Request): string | null {
  const postData = request.postData();
  if (!postData) return null;
  const multipartToken = extractMultipartField(postData, "token");
  if (multipartToken) return multipartToken;
  try {
    const params = new URLSearchParams(postData);
    const token = params.get("token");
    return token || null;
  } catch (_error) {
    return null;
  }
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
  } catch (_error) {
    // ignore JSON parse failures
  }
  return bodyText.toLowerCase().includes("expired");
}

async function loginWithBrowser(
  email: string,
  password: string,
): Promise<UkVisaJobsAuthSession> {
  const [{ launchOptions }, { firefox }] = await Promise.all([
    import("camoufox-js"),
    import("playwright"),
  ]);
  const headless = process.env.UKVISAJOBS_HEADLESS !== "false";
  const browser = await firefox.launch(
    await launchOptions({
      headless,
      humanize: true,
      geoip: true,
    }),
  );
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(SIGNIN_URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#email", { timeout: 15000 });
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(7000);

    const requestPromise = page.waitForRequest(
      (request) =>
        request.url().includes("/ukvisa-api/api/fetch-jobs-data") &&
        request.method() === "POST",
      { timeout: 30000 },
    );

    await page.goto(OPEN_JOBS_URL, { waitUntil: "networkidle" });
    await page.waitForTimeout(5000);

    let fetchRequest: Request | null = null;
    try {
      fetchRequest = await requestPromise;
    } catch (_error) {
      fetchRequest = null;
    }

    const cookies = await context.cookies("https://my.ukvisajobs.com");
    const csrfToken =
      cookies.find((cookie) => cookie.name === "csrf_token")?.value || "";
    const ciSession =
      cookies.find((cookie) => cookie.name === "ci_session")?.value || "";
    const authToken =
      cookies.find((cookie) => cookie.name === "authToken")?.value || "";
    const token = fetchRequest
      ? extractTokenFromRequest(fetchRequest)
      : authToken;

    if (!token) {
      throw new Error("Failed to locate auth token from browser session.");
    }

    return {
      token,
      authToken: authToken || token,
      csrfToken,
      ciSession,
      fetchedAt: new Date().toISOString(),
      source: "browser",
    };
  } finally {
    await browser.close();
  }
}

async function main(): Promise<void> {
  console.log("ðŸ‡¬ðŸ‡§ UK Visa Jobs Extractor starting...");
  const credentials = getLoginCredentials();
  const searchKeyword = process.env.UKVISAJOBS_SEARCH_KEYWORD || undefined;
  const refreshOnly = process.env.UKVISAJOBS_REFRESH_ONLY === "1";

  let authSession = await loadCachedAuthSession();

  if (refreshOnly) {
    if (!credentials) {
      console.error(
        "ERROR: UKVISAJOBS_EMAIL and UKVISAJOBS_PASSWORD must be set",
      );
      process.exit(1);
    }
    console.log("   Refresh-only mode: logging in to refresh tokens...");
    authSession = await loginWithBrowser(
      credentials.email,
      credentials.password,
    );
    await saveCachedAuthSession(authSession);
    console.log("   Auth session refreshed.");
    return;
  }

  if (!authSession) {
    if (!credentials) {
      console.error(
        "ERROR: UKVISAJOBS_EMAIL and UKVISAJOBS_PASSWORD must be set",
      );
      process.exit(1);
    }
    console.log("   No cached session found. Logging in to refresh tokens...");
    authSession = await loginWithBrowser(
      credentials.email,
      credentials.password,
    );
    await saveCachedAuthSession(authSession);
  }

  const cookies = buildCookieHeader(authSession);
  console.log(`   Auth source: ${authSession.source}`);
  console.log(`   Cookies configured: ${cookies ? "Yes" : "No"}`);
  console.log(`   Token length: ${authSession.token.length}`);

  // Get max jobs from environment
  const maxJobsEnv = toNumberOrNull(process.env.UKVISAJOBS_MAX_JOBS);
  const maxJobs = Math.min(maxJobsEnv ?? DEFAULT_MAX_JOBS, MAX_ALLOWED_JOBS);
  const maxPages = Math.ceil(maxJobs / JOBS_PER_PAGE);

  console.log(`   Max jobs: ${maxJobs} (${maxPages} pages)`);
  if (searchKeyword) {
    console.log(`   Search keyword: ${searchKeyword}`);
  }
  emitProgress("init", {
    maxPages,
    maxJobs,
    searchKeyword: searchKeyword || "",
  });

  const allJobs: ExtractedJob[] = [];
  const seenIds = new Set<string>();
  let totalAvailable = 0;
  let pageNo = 1;

  try {
    while (pageNo <= maxPages && allJobs.length < maxJobs) {
      console.log(`   Fetching page ${pageNo}/${maxPages}...`);

      let response: UkVisaJobsApiResponse;
      try {
        response = await fetchPage(pageNo, authSession, { searchKeyword });
      } catch (error) {
        if (!credentials) {
          if (error instanceof UkVisaJobsAuthError) {
            throw new Error(
              "UKVisaJobs auth expired. Set UKVISAJOBS_EMAIL and UKVISAJOBS_PASSWORD to refresh.",
            );
          }
          throw error;
        }

        const reason =
          error instanceof UkVisaJobsAuthError
            ? "Auth expired."
            : "Fetch failed.";
        console.log(`   ${reason} Refreshing tokens and retrying...`);
        authSession = await loginWithBrowser(
          credentials.email,
          credentials.password,
        );
        await saveCachedAuthSession(authSession);
        response = await fetchPage(pageNo, authSession, { searchKeyword });
      }

      if (response.status !== 1) {
        emitProgress("error", {
          pageNo,
          status: response.status,
          message: `API returned status ${response.status}`,
        });
        console.warn(
          `   âš ï¸ API returned status ${response.status} on page ${pageNo}`,
        );
        break;
      }

      if (pageNo === 1) {
        totalAvailable = response.totalJobs;
        console.log(`   Total available: ${totalAvailable} jobs`);
      }

      if (!response.jobs || response.jobs.length === 0) {
        emitProgress("empty_page", {
          pageNo,
          maxPages,
          totalCollected: allJobs.length,
        });
        console.log(`   No more jobs on page ${pageNo}`);
        break;
      }

      for (const rawJob of response.jobs) {
        if (allJobs.length >= maxJobs) break;

        // Deduplicate by ID
        if (seenIds.has(rawJob.id)) continue;
        seenIds.add(rawJob.id);

        const mapped = mapJob(rawJob);
        allJobs.push(mapped);
      }

      emitProgress("page_fetched", {
        pageNo,
        maxPages,
        jobsOnPage: response.jobs.length,
        totalCollected: allJobs.length,
        totalAvailable,
      });

      // If we got fewer jobs than a full page, we're at the end
      if (response.jobs.length < JOBS_PER_PAGE) {
        break;
      }

      pageNo++;

      // Small delay to be nice to the API
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    emitProgress("done", {
      maxPages,
      totalCollected: allJobs.length,
      totalAvailable,
    });
    console.log(`âœ… Scraped ${allJobs.length} jobs`);

    // Write output to storage directory (similar to Crawlee dataset structure)
    const storageDir = join(__dirname, "../storage/datasets/default");
    await mkdir(storageDir, { recursive: true });

    // Write each job as a separate JSON file (Crawlee dataset format)
    for (let i = 0; i < allJobs.length; i++) {
      const filename = join(
        storageDir,
        `${String(i + 1).padStart(6, "0")}.json`,
      );
      await writeFile(filename, JSON.stringify(allJobs[i], null, 2));
    }

    // Also write a combined output file for easier consumption
    const outputFile = join(storageDir, "jobs.json");
    await writeFile(outputFile, JSON.stringify(allJobs, null, 2));

    console.log(`   Output written to: ${storageDir}`);
    console.log(`   Jobs file: ${outputFile}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    emitProgress("error", { message });
    console.error(`âŒ Error: ${message}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
