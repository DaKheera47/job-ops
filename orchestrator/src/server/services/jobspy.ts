/**
 * Service for scraping jobs via JobSpy (Indeed/LinkedIn/etc) and mapping them into our DB shape.
 *
 * Uses a small Python wrapper script that writes both CSV + JSON to disk; we ingest the JSON.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { CreateJobInput, JobSource } from "../../shared/types.js";
import { getDataDir } from "../config/dataDir.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JOBSPY_DIR = join(__dirname, "../../../../extractors/jobspy");
const JOBSPY_SCRIPT = join(JOBSPY_DIR, "scrape_jobs.py");

function getPythonPath(): string {
  if (process.env.PYTHON_PATH) return process.env.PYTHON_PATH;
  return process.platform === "win32" ? "python" : "python3";
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return null;
}

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
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

  const fmt = (n: number) => {
    // Avoid locale ambiguity; keep it simple.
    const rounded = Math.round(n);
    return `${rounded}`;
  };

  let range: string;
  if (minAmount !== null && maxAmount !== null) {
    range = `${fmt(minAmount)}-${fmt(maxAmount)}`;
  } else if (minAmount !== null) {
    range = `${fmt(minAmount)}+`;
  } else if (maxAmount !== null) {
    range = `${fmt(maxAmount)}`;
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
  resultsWanted?: number;
  hoursOld?: number;
  countryIndeed?: string;
  linkedinFetchDescription?: boolean;
  isRemote?: boolean;
}

export interface JobSpyResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

export async function runJobSpy(
  options: RunJobSpyOptions = {},
): Promise<JobSpyResult> {
  const dataDir = getDataDir();
  const outputDir = join(dataDir, "imports");
  await mkdir(outputDir, { recursive: true });

  const sites = (options.sites ?? ["indeed", "linkedin"])
    .filter((s) => s === "indeed" || s === "linkedin")
    .join(",");

  const searchTerms = resolveSearchTerms(options);
  if (searchTerms.length === 0) {
    return { success: true, jobs: [] };
  }

  try {
    const jobs: CreateJobInput[] = [];
    const seenJobUrls = new Set<string>();

    for (let i = 0; i < searchTerms.length; i++) {
      const searchTerm = searchTerms[i];
      const suffix = `${i + 1}_${slugForFilename(searchTerm)}`;
      const outputCsv = join(outputDir, `jobspy_jobs_${suffix}.csv`);
      const outputJson = join(outputDir, `jobspy_jobs_${suffix}.json`);

      await new Promise<void>((resolve, reject) => {
        const pythonPath = getPythonPath();
        const child = spawn(pythonPath, [JOBSPY_SCRIPT], {
          cwd: JOBSPY_DIR,
          shell: false,
          stdio: "inherit",
          env: {
            ...process.env,
            JOBSPY_SITES: sites || "indeed,linkedin",
            JOBSPY_SEARCH_TERM: searchTerm,
            JOBSPY_LOCATION:
              options.location ?? process.env.JOBSPY_LOCATION ?? "UK",
            JOBSPY_RESULTS_WANTED: String(
              options.resultsWanted ?? process.env.JOBSPY_RESULTS_WANTED ?? 200,
            ),
            JOBSPY_HOURS_OLD: String(
              options.hoursOld ?? process.env.JOBSPY_HOURS_OLD ?? 72,
            ),
            JOBSPY_COUNTRY_INDEED:
              options.countryIndeed ??
              process.env.JOBSPY_COUNTRY_INDEED ??
              "UK",
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

        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`JobSpy exited with code ${code}`));
        });
        child.on("error", reject);
      });

      const raw = await readFile(outputJson, "utf-8");
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      const mapped = mapJobSpyRows(parsed);

      for (const job of mapped) {
        const url = job.jobUrl;
        if (seenJobUrls.has(url)) continue;
        seenJobUrls.add(url);
        jobs.push(job);
      }

      try {
        await unlink(outputJson);
        await unlink(outputCsv);
      } catch {
        // Ignore cleanup errors
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
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
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
    .map((t) => t.trim())
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

    const title = toStringOrNull(row.title) ?? "Unknown Title";
    const employer = toStringOrNull(row.company) ?? "Unknown Employer";

    const jobUrlDirect = toStringOrNull(row.job_url_direct);
    const applicationLink = jobUrlDirect ?? jobUrl;

    const minAmount = toNumberOrNull(row.min_amount);
    const maxAmount = toNumberOrNull(row.max_amount);
    const currency = toStringOrNull(row.currency);
    const interval = toStringOrNull(row.interval);

    const salary = formatSalary({ minAmount, maxAmount, currency, interval });

    jobs.push({
      source,
      sourceJobId: toStringOrNull(row.id) ?? undefined,
      jobUrlDirect: jobUrlDirect ?? undefined,
      datePosted: toStringOrNull(row.date_posted) ?? undefined,

      title,
      employer,
      employerUrl: toStringOrNull(row.company_url) ?? undefined,
      jobUrl,
      applicationLink,
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
