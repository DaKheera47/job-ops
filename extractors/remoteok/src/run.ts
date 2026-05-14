/**
 * RemoteOK extractor — public JSON API at remoteok.com/api.
 * Returns array where index 0 is metadata; rest are jobs.
 * 100% remote. No auth required.  Honour their User-Agent guidance:
 * https://remoteok.com/api/docs
 */

import type { CreateJobInput } from "@shared/types/jobs";
import { createRateLimitedFetch } from "@shared/utils/rate-limited-fetch";

const REMOTEOK_API_URL = "https://remoteok.com/api";
const REMOTEOK_USER_AGENT =
  "JobOps/1.0 (+https://github.com/dakheera47/job-ops)";
const DEFAULT_MAX_PER_TERM = 50;

export type RemoteOkWorkplaceType = "remote" | "hybrid" | "onsite";

export type RemoteOkProgressEvent =
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

export interface RunRemoteOkOptions {
  searchTerms?: string[];
  workplaceTypes?: RemoteOkWorkplaceType[];
  maxJobsPerTerm?: number;
  onProgress?: (event: RemoteOkProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface RemoteOkResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

interface RemoteOkJob {
  id?: unknown;
  slug?: unknown;
  position?: unknown;
  company?: unknown;
  company_logo?: unknown;
  location?: unknown;
  tags?: unknown;
  description?: unknown;
  date?: unknown;
  url?: unknown;
  apply_url?: unknown;
  salary_min?: unknown;
  salary_max?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
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
  workplaceTypes: RemoteOkWorkplaceType[] | undefined,
): boolean {
  if (!workplaceTypes || workplaceTypes.length === 0) return true;
  return workplaceTypes.includes("remote");
}

function buildJobUrl(job: RemoteOkJob): string | undefined {
  const explicit = asString(job.url);
  if (explicit) return explicit;
  const slug = asString(job.slug);
  if (slug) return `https://remoteok.com/remote-jobs/${slug}`;
  return undefined;
}

function mapJob(job: RemoteOkJob): CreateJobInput | null {
  const jobUrl = buildJobUrl(job);
  const title = asString(job.position);
  const employer = asString(job.company);
  if (!jobUrl || !title || !employer) return null;

  const sourceJobId =
    typeof job.id === "string" || typeof job.id === "number"
      ? String(job.id)
      : undefined;
  const description = asString(job.description);
  const tags = Array.isArray(job.tags)
    ? job.tags.filter((value): value is string => typeof value === "string")
    : [];
  const location = asString(job.location) ?? "Remote";
  const salaryMin = asNumber(job.salary_min);
  const salaryMax = asNumber(job.salary_max);
  const salary =
    salaryMin || salaryMax
      ? `$${salaryMin ?? ""}${salaryMin && salaryMax ? "-" : ""}${salaryMax ?? ""}`
      : undefined;

  return {
    source: "remoteok",
    sourceJobId,
    title,
    employer,
    jobUrl,
    applicationLink: asString(job.apply_url) ?? jobUrl,
    location,
    locationEvidence: { location, source: "remoteok" },
    jobDescription: description ? stripHtml(description) : undefined,
    datePosted: asString(job.date),
    jobType: "Full-time",
    disciplines: tags.length > 0 ? tags.join(", ") : undefined,
    skills: tags.length > 0 ? tags.join(", ") : undefined,
    salary,
    salaryMinAmount: salaryMin,
    salaryMaxAmount: salaryMax,
    salaryCurrency: salaryMin || salaryMax ? "USD" : undefined,
    companyLogo: asString(job.company_logo),
    isRemote: true,
  };
}

function matchesSearchTerm(job: RemoteOkJob, searchTerm: string): boolean {
  const normalized = searchTerm.toLowerCase().trim();
  if (!normalized) return true;
  const haystack = [
    asString(job.position) ?? "",
    asString(job.description) ?? "",
    asString(job.company) ?? "",
    Array.isArray(job.tags) ? job.tags.join(" ") : "",
  ]
    .join(" ")
    .toLowerCase();
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

async function fetchAllRemoteOkJobs(
  fetchImpl: typeof fetch,
): Promise<RemoteOkJob[]> {
  const response = await fetchImpl(REMOTEOK_API_URL, {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": REMOTEOK_USER_AGENT,
    },
  });
  if (!response.ok) {
    throw new Error(`RemoteOK request failed with ${response.status}`);
  }
  const payload = (await response.json()) as unknown;
  if (!Array.isArray(payload)) {
    throw new Error("RemoteOK API returned an unexpected payload.");
  }
  return payload.filter((entry): entry is RemoteOkJob => {
    if (!entry || typeof entry !== "object") return false;
    const candidate = entry as RemoteOkJob;
    return Boolean(candidate.id) && typeof candidate.position === "string";
  });
}

export async function runRemoteOk(
  options: RunRemoteOkOptions = {},
): Promise<RemoteOkResult> {
  if (!workplaceMatches(options.workplaceTypes)) {
    return { success: true, jobs: [] };
  }

  const fetchImpl = options.fetchImpl ?? createRateLimitedFetch("remoteok");
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = Math.max(
    1,
    Math.min(200, options.maxJobsPerTerm ?? DEFAULT_MAX_PER_TERM),
  );

  try {
    // RemoteOK API returns ALL jobs in one call — fetch once, filter per term.
    const allJobs = await fetchAllRemoteOkJobs(fetchImpl);
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
      for (const raw of allJobs) {
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
          : "Unexpected error while running RemoteOK extractor.";
    return { success: false, jobs: [], error: message };
  }
}
