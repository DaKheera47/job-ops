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
