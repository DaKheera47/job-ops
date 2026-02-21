import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

type CreateJobInput = {
  source: "ukvisajobs";
  sourceJobId?: string;
  title: string;
  employer: string;
  employerUrl?: string;
  jobUrl: string;
  applicationLink?: string;
  location?: string;
  deadline?: string;
  salary?: string;
  jobDescription?: string;
  datePosted?: string;
  degreeRequired?: string;
  jobType?: string;
  jobLevel?: string;
};

import {
  toNumberOrNull,
  toStringOrNull,
} from "@shared/utils/type-conversion.js";

const srcDir = dirname(fileURLToPath(import.meta.url));
const EXTRACTOR_DIR = join(srcDir, "..");
const STORAGE_DIR = join(EXTRACTOR_DIR, "storage/datasets/default");
const AUTH_CACHE_PATH = join(EXTRACTOR_DIR, "storage/ukvisajobs-auth.json");
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";
let isUkVisaJobsRunning = false;

interface UkVisaJobsAuthSession {
  token?: string;
  authToken?: string;
  csrfToken?: string;
  ciSession?: string;
}

export interface RunUkVisaJobsOptions {
  maxJobs?: number;
  searchKeyword?: string;
  searchTerms?: string[];
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

function cleanHtml(html: string): string {
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "");

  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (mainMatch) {
    text = mainMatch[1];
  } else if (bodyMatch) {
    text = bodyMatch[1];
  }

  text = text.replace(/<[^>]+>/g, " ");
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"');
  text = text.replace(/\s+/g, " ").trim();

  if (text.length > 8000) {
    text = `${text.substring(0, 8000)}...`;
  }

  return text;
}

async function fetchJobDescription(url: string): Promise<string | null> {
  try {
    const authSession = await loadCachedAuthSession();
    const cookieParts: string[] = [];
    if (authSession?.csrfToken) {
      cookieParts.push(`csrf_token=${authSession.csrfToken}`);
    }
    if (authSession?.ciSession) {
      cookieParts.push(`ci_session=${authSession.ciSession}`);
    }
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
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;

    const html = await response.text();
    const cleaned = cleanHtml(html);
    return cleaned.length > 100 ? cleaned : null;
  } catch {
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

async function clearStorageDataset(): Promise<void> {
  try {
    await rm(STORAGE_DIR, { recursive: true, force: true });
  } catch {
    // ignore
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
    const terms: string[] = [];
    if (options.searchTerms && options.searchTerms.length > 0) {
      terms.push(...options.searchTerms);
    } else if (options.searchKeyword) {
      terms.push(options.searchKeyword);
    } else {
      terms.push("");
    }

    const allJobs: CreateJobInput[] = [];
    const seenIds = new Set<string>();
    const termTotal = terms.length;

    for (let i = 0; i < terms.length; i += 1) {
      const term = terms[i];
      const termIndex = i + 1;

      try {
        await clearStorageDataset();
        await mkdir(STORAGE_DIR, { recursive: true });

        await new Promise<void>((resolve, reject) => {
          const child = spawn("npx", ["tsx", "src/main.ts"], {
            cwd: EXTRACTOR_DIR,
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
            else {
              reject(
                new Error(`UK Visa Jobs extractor exited with code ${code}`),
              );
            }
          });
          child.on("error", reject);
        });

        const runJobs = await readDataset();
        let jobsFoundTerm = 0;

        for (const job of runJobs) {
          const id = job.sourceJobId || job.jobUrl;
          if (seenIds.has(id)) continue;
          seenIds.add(id);

          const isPoorDescription =
            !job.jobDescription ||
            job.jobDescription.length < 100 ||
            job.jobDescription.startsWith("Visa sponsorship info:");

          if (isPoorDescription && job.jobUrl) {
            const enriched = await fetchJobDescription(job.jobUrl);
            if (enriched) {
              job.jobDescription = enriched;
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          allJobs.push(job);
          jobsFoundTerm += 1;
        }

        options.onProgress?.({
          type: "term_complete",
          termIndex,
          termTotal,
          searchTerm: term,
          jobsFoundTerm,
          totalCollected: allJobs.length,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        options.onProgress?.({
          type: "error",
          termIndex,
          termTotal,
          searchTerm: term,
          message,
        });
      }

      if (i < terms.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }

    return { success: true, jobs: allJobs };
  } finally {
    isUkVisaJobsRunning = false;
  }
}

async function readDataset(): Promise<CreateJobInput[]> {
  const jobs: CreateJobInput[] = [];

  try {
    const files = await readdir(STORAGE_DIR);
    const jsonFiles = files.filter(
      (file) => file.endsWith(".json") && file !== "jobs.json",
    );

    for (const file of jsonFiles.sort()) {
      try {
        const content = await readFile(join(STORAGE_DIR, file), "utf-8");
        const job = JSON.parse(content) as Record<string, unknown>;

        jobs.push({
          source: "ukvisajobs",
          sourceJobId: job.sourceJobId as string | undefined,
          title: (job.title as string) || "Unknown Title",
          employer: (job.employer as string) || "Unknown Employer",
          employerUrl: job.employerUrl as string | undefined,
          jobUrl: job.jobUrl as string,
          applicationLink:
            (job.applicationLink as string | undefined) ||
            (job.jobUrl as string),
          location: job.location as string | undefined,
          deadline: job.deadline as string | undefined,
          salary: job.salary as string | undefined,
          jobDescription: job.jobDescription as string | undefined,
          datePosted: job.datePosted as string | undefined,
          degreeRequired: job.degreeRequired as string | undefined,
          jobType: job.jobType as string | undefined,
          jobLevel: job.jobLevel as string | undefined,
        });
      } catch {
        // ignore invalid file
      }
    }
  } catch {
    // ignore missing dir
  }

  return jobs;
}
