/**
 * Himalayas extractor — public JSON API at himalayas.app/jobs/api.
 * Returns 100% remote jobs.  Public endpoint; rate-limited per IP.
 */

import type { CreateJobInput } from "@shared/types/jobs";
import { createRateLimitedFetch } from "@shared/utils/rate-limited-fetch";

const HIMALAYAS_API_URL = "https://himalayas.app/jobs/api";
const DEFAULT_MAX_PER_TERM = 50;

export type HimalayasWorkplaceType = "remote" | "hybrid" | "onsite";

export type HimalayasProgressEvent =
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

export interface RunHimalayasOptions {
  searchTerms?: string[];
  workplaceTypes?: HimalayasWorkplaceType[];
  maxJobsPerTerm?: number;
  onProgress?: (event: HimalayasProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface HimalayasResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

interface HimalayasJob {
  guid?: unknown;
  applicationLink?: unknown;
  title?: unknown;
  jobSlug?: unknown;
  companyName?: unknown;
  companyLogo?: unknown;
  locationRestrictions?: unknown;
  pubDate?: unknown;
  description?: unknown;
  excerpt?: unknown;
  categories?: unknown;
  seniority?: unknown;
  employmentType?: unknown;
  minSalary?: unknown;
  maxSalary?: unknown;
}

interface HimalayasResponse {
  jobs?: HimalayasJob[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function stripHtml(value: string): string {
  return value
    .replace(/<\/(p|div|li|br|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function workplaceMatches(
  workplaceTypes: HimalayasWorkplaceType[] | undefined,
): boolean {
  if (!workplaceTypes || workplaceTypes.length === 0) return true;
  return workplaceTypes.includes("remote");
}

function buildJobUrl(job: HimalayasJob): string | undefined {
  const guid = asString(job.guid);
  if (guid && guid.startsWith("http")) return guid;
  const slug = asString(job.jobSlug);
  if (slug) return `https://himalayas.app/jobs/${slug}`;
  return asString(job.applicationLink);
}

function mapJob(job: HimalayasJob): CreateJobInput | null {
  const jobUrl = buildJobUrl(job);
  const title = asString(job.title);
  const employer = asString(job.companyName);
  if (!jobUrl || !title || !employer) return null;

  const description = asString(job.description) ?? asString(job.excerpt);
  const restrictions = Array.isArray(job.locationRestrictions)
    ? job.locationRestrictions.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const categories = Array.isArray(job.categories)
    ? job.categories.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const location =
    restrictions.length > 0 ? restrictions.join(", ") : "Remote";
  const minSalary = asNumber(job.minSalary);
  const maxSalary = asNumber(job.maxSalary);
  const salary =
    minSalary || maxSalary
      ? `$${minSalary ?? ""}${minSalary && maxSalary ? "-" : ""}${maxSalary ?? ""}`
      : undefined;

  return {
    source: "himalayas",
    sourceJobId: asString(job.guid),
    title,
    employer,
    jobUrl,
    applicationLink: asString(job.applicationLink) ?? jobUrl,
    location,
    locationEvidence: { location, source: "himalayas" },
    jobDescription: description ? stripHtml(description) : undefined,
    datePosted: asString(job.pubDate),
    jobType: asString(job.employmentType) ?? "Full-time",
    jobLevel: asString(job.seniority),
    disciplines: categories.length > 0 ? categories.join(", ") : undefined,
    skills: categories.length > 0 ? categories.join(", ") : undefined,
    companyLogo: asString(job.companyLogo),
    salary,
    salaryMinAmount: minSalary,
    salaryMaxAmount: maxSalary,
    salaryCurrency: minSalary || maxSalary ? "USD" : undefined,
    isRemote: true,
  };
}

function matchesSearchTerm(job: HimalayasJob, searchTerm: string): boolean {
  const normalized = searchTerm.toLowerCase().trim();
  if (!normalized) return true;
  const haystack = [
    asString(job.title) ?? "",
    asString(job.description) ?? "",
    asString(job.excerpt) ?? "",
    asString(job.companyName) ?? "",
    Array.isArray(job.categories) ? job.categories.join(" ") : "",
  ]
    .join(" ")
    .toLowerCase();
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

async function fetchHimalayas(
  fetchImpl: typeof fetch,
): Promise<HimalayasJob[]> {
  const response = await fetchImpl(HIMALAYAS_API_URL, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Himalayas request failed with ${response.status}`);
  }
  const payload = (await response.json()) as HimalayasResponse;
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

export async function runHimalayas(
  options: RunHimalayasOptions = {},
): Promise<HimalayasResult> {
  if (!workplaceMatches(options.workplaceTypes)) {
    return { success: true, jobs: [] };
  }

  const fetchImpl = options.fetchImpl ?? createRateLimitedFetch("himalayas");
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = Math.max(
    1,
    Math.min(200, options.maxJobsPerTerm ?? DEFAULT_MAX_PER_TERM),
  );

  try {
    // Himalayas returns ALL jobs at once — fetch once, filter per term.
    const all = await fetchHimalayas(fetchImpl);
    const jobs: CreateJobInput[] = [];
    const seen = new Set<string>();

    for (const [index, searchTerm] of searchTerms.entries()) {
      if (options.shouldCancel?.()) return { success: true, jobs };

      options.onProgress?.({
        type: "term_start",
        termIndex: index + 1,
        termTotal: searchTerms.length,
        searchTerm,
      });

      let jobsFoundTerm = 0;
      for (const raw of all) {
        if (options.shouldCancel?.()) return { success: true, jobs };
        if (jobsFoundTerm >= maxJobsPerTerm) break;
        if (!matchesSearchTerm(raw, searchTerm)) continue;

        const mapped = mapJob(raw);
        if (!mapped) continue;
        const dedupeKey = mapped.sourceJobId ?? mapped.jobUrl;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        jobs.push(mapped);
        jobsFoundTerm += 1;
      }

      options.onProgress?.({
        type: "term_complete",
        termIndex: index + 1,
        termTotal: searchTerms.length,
        searchTerm,
        jobsFoundTerm,
      });
    }

    return { success: true, jobs };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unexpected error while running Himalayas extractor.";
    return { success: false, jobs: [], error: message };
  }
}
