import { spawn } from "node:child_process";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { resolveSearchCities } from "@shared/search-cities.js";
import type { CreateJobInput, JobSource } from "@shared/types/jobs";
import {
  toNumberOrNull,
  toStringOrNull,
} from "@shared/utils/type-conversion.js";

const srcDir = dirname(fileURLToPath(import.meta.url));
const EXTRACTOR_DIR = join(srcDir, "..");
const JOBSPY_SCRIPT = join(EXTRACTOR_DIR, "scrape_jobs.py");
const OUTPUT_DIR = join(EXTRACTOR_DIR, "storage/imports");
const JOBOPS_PROGRESS_PREFIX = "JOBOPS_PROGRESS ";

export type JobSpyProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export function parseJobSpyProgressLine(
  line: string,
): JobSpyProgressEvent | null {
  if (!line.startsWith(JOBOPS_PROGRESS_PREFIX)) return null;
  const raw = line.slice(JOBOPS_PROGRESS_PREFIX.length).trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }

  const eventName = toStringOrNull(parsed.event);
  const termIndex = toNumberOrNull(parsed.termIndex);
  const termTotal = toNumberOrNull(parsed.termTotal);
  const searchTerm = toStringOrNull(parsed.searchTerm) ?? "";

  if (!eventName || termIndex === null || termTotal === null) return null;
  if (eventName === "term_start") {
    return { type: "term_start", termIndex, termTotal, searchTerm };
  }
  if (eventName === "term_complete") {
    return {
      type: "term_complete",
      termIndex,
      termTotal,
      searchTerm,
      jobsFoundTerm: toNumberOrNull(parsed.jobsFoundTerm) ?? 0,
    };
  }
  return null;
}

function toBooleanOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  }
  return null;
}

function toJsonStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return toStringOrNull(value);
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function toJobSource(site: unknown): JobSource | null {
  const raw = toStringOrNull(site)?.toLowerCase();
  if (raw === "gradcracker") return "gradcracker";
  if (raw === "indeed") return "indeed";
  if (raw === "linkedin") return "linkedin";
  if (raw === "glassdoor") return "glassdoor";
  return null;
}

function formatSalary(params: {
  minAmount: number | null;
  maxAmount: number | null;
  currency: string | null;
  interval: string | null;
}): string | null {
  const { minAmount, maxAmount, currency, interval } = params;
  if (minAmount === null && maxAmount === null) return null;

  const fmt = (n: number) => `${Math.round(n)}`;
  let range: string;
  if (minAmount !== null && maxAmount !== null) {
    range = `${fmt(minAmount)}-${fmt(maxAmount)}`;
  } else if (minAmount !== null) {
    range = `${fmt(minAmount)}+`;
  } else if (maxAmount !== null) {
    range = fmt(maxAmount);
  } else {
    return null;
  }

  const currencyPart = currency ? `${currency} ` : "";
  const intervalPart = interval ? ` / ${interval}` : "";
  return `${currencyPart}${range}${intervalPart}`.trim();
}

export interface RunJobSpyOptions {
  sites?: Array<JobSource>;
  searchTerms?: string[];
  location?: string;
  locations?: string[];
  resultsWanted?: number;
  hoursOld?: number;
  countryIndeed?: string;
  linkedinFetchDescription?: boolean;
  isRemote?: boolean;
  onProgress?: (event: JobSpyProgressEvent) => void;
}

export interface JobSpyResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

export async function runJobSpy(
  options: RunJobSpyOptions = {},
): Promise<JobSpyResult> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const sites = (options.sites ?? ["indeed", "linkedin", "glassdoor"])
    .filter(
      (site) =>
        site === "indeed" || site === "linkedin" || site === "glassdoor",
    )
    .join(",");

  const searchTerms = resolveSearchTerms(options);
  const locations = resolveSearchCities({
    list: options.locations,
    single: options.location,
    env: process.env.JOBSPY_LOCATION,
    fallback: "UK",
  });
  const countryIndeed =
    options.countryIndeed ?? process.env.JOBSPY_COUNTRY_INDEED ?? "UK";
  if (searchTerms.length === 0) {
    return { success: true, jobs: [] };
  }

  try {
    const jobs: CreateJobInput[] = [];
    const seenJobUrls = new Set<string>();
    const totalRuns = searchTerms.length * locations.length;
    let runIndex = 0;

    for (const searchTerm of searchTerms) {
      for (const location of locations) {
        runIndex += 1;
        const suffix = `${runIndex}_${slugForFilename(searchTerm)}_${slugForFilename(location)}`;
        const outputCsv = join(OUTPUT_DIR, `jobspy_jobs_${suffix}.csv`);
        const outputJson = join(OUTPUT_DIR, `jobspy_jobs_${suffix}.json`);

        await new Promise<void>((resolve, reject) => {
          const pythonPath = process.env.PYTHON_PATH
            ? process.env.PYTHON_PATH
            : process.platform === "win32"
              ? "python"
              : "python3";

          const child = spawn(pythonPath, [JOBSPY_SCRIPT], {
            cwd: EXTRACTOR_DIR,
            shell: false,
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              ...process.env,
              JOBSPY_SITES: sites || "indeed,linkedin,glassdoor",
              JOBSPY_SEARCH_TERM: searchTerm,
              JOBSPY_TERM_INDEX: String(runIndex),
              JOBSPY_TERM_TOTAL: String(totalRuns),
              JOBSPY_LOCATION: location,
              JOBSPY_RESULTS_WANTED: String(
                options.resultsWanted ??
                  process.env.JOBSPY_RESULTS_WANTED ??
                  200,
              ),
              JOBSPY_HOURS_OLD: String(
                options.hoursOld ?? process.env.JOBSPY_HOURS_OLD ?? 72,
              ),
              JOBSPY_COUNTRY_INDEED: countryIndeed,
              JOBSPY_LINKEDIN_FETCH_DESCRIPTION: String(
                options.linkedinFetchDescription ??
                  process.env.JOBSPY_LINKEDIN_FETCH_DESCRIPTION ??
                  "1",
              ),
              JOBSPY_IS_REMOTE: String(
                options.isRemote ?? process.env.JOBSPY_IS_REMOTE ?? "0",
              ),
              JOBSPY_OUTPUT_CSV: outputCsv,
              JOBSPY_OUTPUT_JSON: outputJson,
            },
          });

          const handleLine = (line: string, stream: NodeJS.WriteStream) => {
            const event = parseJobSpyProgressLine(line);
            if (event) {
              options.onProgress?.(event);
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
            else reject(new Error(`JobSpy exited with code ${code}`));
          });
          child.on("error", reject);
        });

        const raw = await readFile(outputJson, "utf-8");
        const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
        const filtered = mapJobSpyRows(parsed);

        for (const job of filtered) {
          if (seenJobUrls.has(job.jobUrl)) continue;
          seenJobUrls.add(job.jobUrl);
          jobs.push(job);
        }

        try {
          await unlink(outputJson);
          await unlink(outputCsv);
        } catch {
          // ignore cleanup errors
        }
      }
    }

    return { success: true, jobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, jobs: [], error: message };
  }
}

function resolveSearchTerms(options: RunJobSpyOptions): string[] {
  const fromOptions = options.searchTerms?.length ? options.searchTerms : null;
  const fromEnv = parseSearchTermsEnv(process.env.JOBSPY_SEARCH_TERMS);
  const raw = fromOptions ?? fromEnv ?? ["web developer"];
  const out: string[] = [];
  const seen = new Set<string>();

  for (const term of raw) {
    const normalized = term.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function parseSearchTermsEnv(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (
        Array.isArray(parsed) &&
        parsed.every((value) => typeof value === "string")
      ) {
        return parsed;
      }
    } catch {
      // fall through
    }
  }

  const delimiter = trimmed.includes("|")
    ? "|"
    : trimmed.includes("\n")
      ? "\n"
      : ",";
  const split = trimmed
    .split(delimiter)
    .map((term) => term.trim())
    .filter(Boolean);
  return split.length > 0 ? split : null;
}

function slugForFilename(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return slug || "term";
}

function mapJobSpyRows(
  parsed: Array<Record<string, unknown>>,
): CreateJobInput[] {
  const jobs: CreateJobInput[] = [];

  for (const row of parsed) {
    const source = toJobSource(row.site);
    if (!source) continue;

    const jobUrl = toStringOrNull(row.job_url);
    if (!jobUrl) continue;

    const minAmount = toNumberOrNull(row.min_amount);
    const maxAmount = toNumberOrNull(row.max_amount);
    const currency = toStringOrNull(row.currency);
    const interval = toStringOrNull(row.interval);
    const salary = formatSalary({ minAmount, maxAmount, currency, interval });

    const jobUrlDirect = toStringOrNull(row.job_url_direct);

    jobs.push({
      source,
      sourceJobId: toStringOrNull(row.id) ?? undefined,
      jobUrlDirect: jobUrlDirect ?? undefined,
      datePosted: toStringOrNull(row.date_posted) ?? undefined,
      title: toStringOrNull(row.title) ?? "Unknown Title",
      employer: toStringOrNull(row.company) ?? "Unknown Employer",
      employerUrl: toStringOrNull(row.company_url) ?? undefined,
      jobUrl,
      applicationLink: jobUrlDirect ?? jobUrl,
      location: toStringOrNull(row.location) ?? undefined,
      jobDescription: toStringOrNull(row.description) ?? undefined,
      salary: salary ?? undefined,
      jobType: toStringOrNull(row.job_type) ?? undefined,
      salarySource: toStringOrNull(row.salary_source) ?? undefined,
      salaryInterval: interval ?? undefined,
      salaryMinAmount: minAmount ?? undefined,
      salaryMaxAmount: maxAmount ?? undefined,
      salaryCurrency: currency ?? undefined,
      isRemote: toBooleanOrNull(row.is_remote) ?? undefined,
      jobLevel: toStringOrNull(row.job_level) ?? undefined,
      jobFunction: toStringOrNull(row.job_function) ?? undefined,
      listingType: toStringOrNull(row.listing_type) ?? undefined,
      emails: toJsonStringOrNull(row.emails) ?? undefined,
      companyIndustry: toStringOrNull(row.company_industry) ?? undefined,
      companyLogo: toStringOrNull(row.company_logo) ?? undefined,
      companyUrlDirect: toStringOrNull(row.company_url_direct) ?? undefined,
      companyAddresses: toJsonStringOrNull(row.company_addresses) ?? undefined,
      companyNumEmployees:
        toStringOrNull(row.company_num_employees) ?? undefined,
      companyRevenue: toStringOrNull(row.company_revenue) ?? undefined,
      companyDescription: toStringOrNull(row.company_description) ?? undefined,
      skills: toJsonStringOrNull(row.skills) ?? undefined,
      experienceRange: toJsonStringOrNull(row.experience_range) ?? undefined,
      companyRating: toNumberOrNull(row.company_rating) ?? undefined,
      companyReviewsCount:
        toNumberOrNull(row.company_reviews_count) ?? undefined,
      vacancyCount: toNumberOrNull(row.vacancy_count) ?? undefined,
      workFromHomeType: toStringOrNull(row.work_from_home_type) ?? undefined,
    });
  }

  return jobs;
}
