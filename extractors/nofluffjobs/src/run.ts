/**
 * NoFluffJobs extractor — Polish/EU tech-jobs board with open salaries.
 * Public JSON API at nofluffjobs.com/api/posting — no auth required.
 *
 * Strong on remote-EU tech roles, especially Polish/Czech companies that
 * employ candidates anywhere in EU.
 */

import type { CreateJobInput } from "@shared/types/jobs";
import { createRateLimitedFetch } from "@shared/utils/rate-limited-fetch";

const NFJ_API_URL = "https://nofluffjobs.com/api/posting";
const DEFAULT_MAX_PER_TERM = 50;

export type NfjWorkplaceType = "remote" | "hybrid" | "onsite";

export type NfjProgressEvent =
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

export interface RunNfjOptions {
  searchTerms?: string[];
  workplaceTypes?: NfjWorkplaceType[];
  maxJobsPerTerm?: number;
  onProgress?: (event: NfjProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface NfjResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

interface NfjPosting {
  id?: unknown;
  url?: unknown;
  name?: unknown;
  title?: unknown;
  posted?: unknown;
  renewed?: unknown;
  location?: unknown;
  category?: unknown;
  seniority?: unknown;
  requirements?: unknown;
  salary?: unknown;
  fullyRemote?: unknown;
  remote?: unknown;
}

interface NfjResponse {
  postings?: NfjPosting[];
  totalCount?: number;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function workplaceMatches(
  workplaceTypes: NfjWorkplaceType[] | undefined,
): boolean {
  if (!workplaceTypes || workplaceTypes.length === 0) return true;
  return workplaceTypes.includes("remote");
}

function isFullyRemotePosting(posting: NfjPosting): boolean {
  if (typeof posting.fullyRemote === "boolean" && posting.fullyRemote)
    return true;
  if (posting.location && typeof posting.location === "object") {
    const loc = posting.location as Record<string, unknown>;
    if (loc.fullyRemote === true) return true;
    if (Array.isArray(loc.places)) {
      for (const place of loc.places) {
        if (place && typeof place === "object") {
          const candidate = place as Record<string, unknown>;
          if (candidate.fullyRemote === true) return true;
          const city = asString(candidate.city);
          if (city?.toLowerCase() === "remote") return true;
        }
      }
    }
  }
  if (typeof posting.remote === "string" && posting.remote.toLowerCase().includes("yes"))
    return true;
  return false;
}

function inferLocation(posting: NfjPosting): string {
  if (isFullyRemotePosting(posting)) return "Remote";
  if (posting.location && typeof posting.location === "object") {
    const loc = posting.location as Record<string, unknown>;
    if (Array.isArray(loc.places)) {
      const cities: string[] = [];
      for (const place of loc.places) {
        if (place && typeof place === "object") {
          const candidate = place as Record<string, unknown>;
          const city = asString(candidate.city);
          const country =
            asString(candidate.country) ?? asString(candidate.countryCode);
          if (city) cities.push(country ? `${city}, ${country}` : city);
        }
      }
      if (cities.length > 0) return cities.join("; ");
    }
  }
  return "Remote";
}

function flattenSalary(posting: NfjPosting): {
  salary?: string;
  min?: number;
  max?: number;
  currency?: string;
} {
  const raw = posting.salary;
  if (!raw || typeof raw !== "object") return {};
  const candidate = raw as Record<string, unknown>;
  const from = asNumber(candidate.from);
  const to = asNumber(candidate.to);
  const currency = asString(candidate.currency);
  const type = asString(candidate.type);
  if (!from && !to) return {};
  const formatted = [from ?? "", to ?? ""].filter(Boolean).join(" - ").trim();
  const display = [formatted, currency, type ? `(${type})` : ""]
    .filter(Boolean)
    .join(" ")
    .trim();
  return { salary: display || undefined, min: from, max: to, currency };
}

function flattenSkills(posting: NfjPosting): string | undefined {
  const raw = posting.requirements;
  if (!raw || typeof raw !== "object") return undefined;
  const must = (raw as Record<string, unknown>).musts;
  if (!Array.isArray(must)) return undefined;
  const skills: string[] = [];
  for (const entry of must) {
    if (entry && typeof entry === "object") {
      const value = (entry as Record<string, unknown>).value;
      if (typeof value === "string") skills.push(value);
    }
  }
  return skills.length > 0 ? skills.join(", ") : undefined;
}

function buildJobUrl(posting: NfjPosting): string | undefined {
  const url = asString(posting.url);
  if (url && url.startsWith("http")) return url;
  if (url) return `https://nofluffjobs.com/job/${url}`;
  const id = asString(posting.id);
  if (id) return `https://nofluffjobs.com/job/${id}`;
  return undefined;
}

function mapPosting(posting: NfjPosting): CreateJobInput | null {
  const jobUrl = buildJobUrl(posting);
  const title = asString(posting.title) ?? asString(posting.name);
  if (!jobUrl || !title) return null;

  const employer =
    posting.name && typeof posting.name === "string"
      ? posting.name.split(/\s—\s|\s-\s/)[0]?.trim() || "Unknown Employer"
      : "Unknown Employer";

  const isRemote = isFullyRemotePosting(posting);
  const location = inferLocation(posting);
  const skills = flattenSkills(posting);
  const salary = flattenSalary(posting);

  return {
    source: "nofluffjobs",
    sourceJobId: asString(posting.id),
    title,
    employer,
    jobUrl,
    applicationLink: jobUrl,
    location,
    locationEvidence: { location, source: "nofluffjobs" },
    datePosted: asString(posting.posted) ?? asString(posting.renewed),
    jobLevel: asString(posting.seniority),
    jobFunction: asString(posting.category),
    skills,
    disciplines: skills,
    salary: salary.salary,
    salaryMinAmount: salary.min,
    salaryMaxAmount: salary.max,
    salaryCurrency: salary.currency,
    isRemote,
  };
}

function matchesSearchTerm(posting: NfjPosting, searchTerm: string): boolean {
  const normalized = searchTerm.toLowerCase().trim();
  if (!normalized) return true;
  const title = asString(posting.title) ?? asString(posting.name) ?? "";
  const skills = flattenSkills(posting) ?? "";
  const haystack = `${title} ${skills}`.toLowerCase();
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

async function fetchPostings(args: {
  fetchImpl: typeof fetch;
  remoteOnly: boolean;
  pageSize: number;
}): Promise<NfjPosting[]> {
  const url = new URL(NFJ_API_URL);
  url.searchParams.set("pageSize", String(args.pageSize));
  url.searchParams.set("pageNumber", "1");
  if (args.remoteOnly) {
    url.searchParams.set("criteria", "remote=true");
  }

  // NoFluffJobs' public posting API expects GET; POST returns 405.
  const response = await args.fetchImpl(url.toString(), {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`NoFluffJobs request failed with ${response.status}`);
  }
  const payload = (await response.json()) as NfjResponse;
  return Array.isArray(payload.postings) ? payload.postings : [];
}

export async function runNoFluffJobs(
  options: RunNfjOptions = {},
): Promise<NfjResult> {
  if (!workplaceMatches(options.workplaceTypes)) {
    return { success: true, jobs: [] };
  }

  const fetchImpl = options.fetchImpl ?? createRateLimitedFetch("nofluffjobs");
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = Math.max(
    1,
    Math.min(200, options.maxJobsPerTerm ?? DEFAULT_MAX_PER_TERM),
  );
  const remoteOnly =
    options.workplaceTypes?.length === 1 &&
    options.workplaceTypes[0] === "remote";

  try {
    const postings = await fetchPostings({
      fetchImpl,
      remoteOnly,
      pageSize: 200,
    });

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
      for (const posting of postings) {
        if (options.shouldCancel?.()) return { success: true, jobs };
        if (jobsFoundTerm >= maxJobsPerTerm) break;
        if (!matchesSearchTerm(posting, searchTerm)) continue;

        const mapped = mapPosting(posting);
        if (!mapped) continue;
        // For remote-only mode, skip postings that aren't fully remote.
        if (remoteOnly && !mapped.isRemote) continue;

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
          : "Unexpected error while running NoFluffJobs extractor.";
    return { success: false, jobs: [], error: message };
  }
}
