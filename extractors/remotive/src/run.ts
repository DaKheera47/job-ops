/**
 * Remotive extractor — public JSON API at remotive.com/api/remote-jobs.
 * Returns 100% remote jobs. No auth required.
 */

import type { CreateJobInput } from "@shared/types/jobs";
import { createRateLimitedFetch } from "@shared/utils/rate-limited-fetch";
import { termMatchesHaystack } from "@shared/utils/term-match";

const REMOTIVE_API_URL = "https://remotive.com/api/remote-jobs";
// Single HTTP call returns all jobs — filtering is in-memory, so a higher
// cap costs nothing and helps when the user has many synonymous terms.
const DEFAULT_MAX_PER_TERM = 150;

export type RemotiveWorkplaceType = "remote" | "hybrid" | "onsite";

export type RemotiveProgressEvent =
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

export interface RunRemotiveOptions {
  searchTerms?: string[];
  workplaceTypes?: RemotiveWorkplaceType[];
  maxJobsPerTerm?: number;
  onProgress?: (event: RemotiveProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface RemotiveResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

interface RemotiveJob {
  id?: unknown;
  url?: unknown;
  title?: unknown;
  company_name?: unknown;
  company_logo?: unknown;
  category?: unknown;
  tags?: unknown;
  job_type?: unknown;
  publication_date?: unknown;
  candidate_required_location?: unknown;
  salary?: unknown;
  description?: unknown;
}

interface RemotiveResponse {
  jobs?: RemotiveJob[];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
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
  workplaceTypes: RemotiveWorkplaceType[] | undefined,
): boolean {
  if (!workplaceTypes || workplaceTypes.length === 0) return true;
  return workplaceTypes.includes("remote");
}

function mapJob(job: RemotiveJob): CreateJobInput | null {
  const url = asString(job.url);
  const title = asString(job.title);
  const employer = asString(job.company_name);
  if (!url || !title || !employer) return null;

  const sourceJobId =
    typeof job.id === "number"
      ? String(job.id)
      : typeof job.id === "string"
        ? job.id
        : undefined;
  const description = asString(job.description);
  const tags = Array.isArray(job.tags)
    ? job.tags.filter((value): value is string => typeof value === "string")
    : [];
  const candidateLocation = asString(job.candidate_required_location);

  return {
    source: "remotive",
    sourceJobId,
    title,
    employer,
    jobUrl: url,
    applicationLink: url,
    location: candidateLocation ?? "Remote",
    locationEvidence: {
      location: candidateLocation ?? "Remote",
      source: "remotive",
    },
    jobDescription: description ? stripHtml(description) : undefined,
    datePosted: asString(job.publication_date),
    jobType: asString(job.job_type) ?? "Full-time",
    jobFunction: asString(job.category),
    disciplines: tags.length > 0 ? tags.join(", ") : undefined,
    skills: tags.length > 0 ? tags.join(", ") : undefined,
    salary: asString(job.salary),
    companyLogo: asString(job.company_logo),
    isRemote: true,
  };
}

function matchesSearchTerm(job: RemotiveJob, searchTerm: string): boolean {
  const haystack = [
    asString(job.title) ?? "",
    asString(job.description) ?? "",
    asString(job.company_name) ?? "",
    asString(job.category) ?? "",
    Array.isArray(job.tags) ? job.tags.join(" ") : "",
  ].join(" ");
  return termMatchesHaystack(haystack, searchTerm);
}

async function fetchRemotive(args: {
  fetchImpl: typeof fetch;
  searchTerm: string;
  limit: number;
}): Promise<RemotiveJob[]> {
  const url = new URL(REMOTIVE_API_URL);
  if (args.searchTerm) url.searchParams.set("search", args.searchTerm);
  url.searchParams.set("limit", String(args.limit));

  const response = await args.fetchImpl(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Remotive request failed with ${response.status}`);
  }
  const payload = (await response.json()) as RemotiveResponse;
  return Array.isArray(payload.jobs) ? payload.jobs : [];
}

export async function runRemotive(
  options: RunRemotiveOptions = {},
): Promise<RemotiveResult> {
  if (!workplaceMatches(options.workplaceTypes)) {
    return { success: true, jobs: [] };
  }

  const fetchImpl = options.fetchImpl ?? createRateLimitedFetch("remotive");
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = Math.max(
    1,
    Math.min(200, options.maxJobsPerTerm ?? DEFAULT_MAX_PER_TERM),
  );

  try {
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

      const fetched = await fetchRemotive({
        fetchImpl,
        searchTerm,
        limit: maxJobsPerTerm,
      });

      let jobsFoundTerm = 0;
      for (const raw of fetched) {
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
          : "Unexpected error while running Remotive extractor.";
    return { success: false, jobs: [], error: message };
  }
}
