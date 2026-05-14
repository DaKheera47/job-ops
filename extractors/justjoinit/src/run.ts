/**
 * JustJoin.it extractor — Polish/EU tech-jobs board with English-friendly UI.
 * Public JSON API at api.justjoin.it/v2/user-panel/offers — no auth required.
 *
 * Many EU companies post fully-remote roles here that don't appear on
 * LinkedIn / Indeed.
 */

import type { CreateJobInput } from "@shared/types/jobs";
import { createRateLimitedFetch } from "@shared/utils/rate-limited-fetch";

const JJI_API_URL = "https://api.justjoin.it/v2/user-panel/offers";
const DEFAULT_MAX_PER_TERM = 50;
const PAGE_SIZE = 100;

export type JjiWorkplaceType = "remote" | "hybrid" | "onsite";

export type JjiProgressEvent =
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

export interface RunJjiOptions {
  searchTerms?: string[];
  workplaceTypes?: JjiWorkplaceType[];
  maxJobsPerTerm?: number;
  onProgress?: (event: JjiProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface JjiResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

interface JjiOffer {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  companyName?: unknown;
  companyLogoThumbUrl?: unknown;
  city?: unknown;
  countryCode?: unknown;
  workplaceType?: unknown;
  remoteInterview?: unknown;
  experienceLevel?: unknown;
  employmentTypes?: unknown;
  publishedAt?: unknown;
  requiredSkills?: unknown;
  niceToHaveSkills?: unknown;
  body?: unknown;
}

interface JjiResponse {
  data?: JjiOffer[];
  meta?: { totalItems?: number };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function workplaceMatches(
  workplaceTypes: JjiWorkplaceType[] | undefined,
): boolean {
  if (!workplaceTypes || workplaceTypes.length === 0) return true;
  return workplaceTypes.includes("remote");
}

function inferLocation(offer: JjiOffer): string {
  const city = asString(offer.city);
  const country = asString(offer.countryCode);
  const workplace = asString(offer.workplaceType);
  if (workplace?.toLowerCase() === "remote") return "Remote";
  if (city && country) return `${city}, ${country.toUpperCase()}`;
  if (city) return city;
  if (country) return country.toUpperCase();
  return "Remote";
}

function flattenSalaryRange(offer: JjiOffer): {
  salary?: string;
  min?: number;
  max?: number;
  currency?: string;
} {
  // Older shape — salaryFrom/salaryTo, currencies. We'll use a defensive approach.
  const employmentTypes = Array.isArray(offer.employmentTypes)
    ? offer.employmentTypes
    : [];
  for (const entry of employmentTypes) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as Record<string, unknown>;
    const from =
      typeof candidate.from === "number" ? candidate.from : undefined;
    const to = typeof candidate.to === "number" ? candidate.to : undefined;
    const currency =
      asString(candidate.currency) ?? asString(candidate.salaryCurrency);
    if (from || to) {
      const formatted = [from ?? "", to ?? ""]
        .filter(Boolean)
        .join(" - ")
        .trim();
      return {
        salary: currency
          ? `${formatted} ${currency.toUpperCase()}`
          : formatted || undefined,
        min: from,
        max: to,
        currency: currency?.toUpperCase(),
      };
    }
  }
  return {};
}

function flattenSkills(offer: JjiOffer): string | undefined {
  const required = Array.isArray(offer.requiredSkills)
    ? offer.requiredSkills.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const niceToHave = Array.isArray(offer.niceToHaveSkills)
    ? offer.niceToHaveSkills.filter(
        (value): value is string => typeof value === "string",
      )
    : [];
  const merged = [...required, ...niceToHave];
  return merged.length > 0 ? merged.join(", ") : undefined;
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

function mapOffer(offer: JjiOffer): CreateJobInput | null {
  const slug = asString(offer.slug);
  const title = asString(offer.title);
  const employer = asString(offer.companyName);
  if (!slug || !title || !employer) return null;

  const jobUrl = `https://justjoin.it/job-offer/${slug}`;
  const isRemote =
    typeof offer.workplaceType === "string" &&
    offer.workplaceType.toLowerCase() === "remote";
  const location = inferLocation(offer);
  const salary = flattenSalaryRange(offer);
  const skills = flattenSkills(offer);
  const description = asString(offer.body);

  return {
    source: "justjoinit",
    sourceJobId: typeof offer.id === "string" ? offer.id : slug,
    title,
    employer,
    jobUrl,
    applicationLink: jobUrl,
    location,
    locationEvidence: { location, source: "justjoinit" },
    jobDescription: description ? stripHtml(description) : undefined,
    datePosted: asString(offer.publishedAt),
    jobLevel: asString(offer.experienceLevel),
    skills,
    disciplines: skills,
    salary: salary.salary,
    salaryMinAmount: salary.min,
    salaryMaxAmount: salary.max,
    salaryCurrency: salary.currency,
    companyLogo: asString(offer.companyLogoThumbUrl),
    isRemote,
  };
}

function matchesSearchTerm(offer: JjiOffer, searchTerm: string): boolean {
  const normalized = searchTerm.toLowerCase().trim();
  if (!normalized) return true;
  const skills = Array.isArray(offer.requiredSkills)
    ? offer.requiredSkills
    : [];
  const haystack = [
    asString(offer.title) ?? "",
    asString(offer.companyName) ?? "",
    asString(offer.body) ?? "",
    skills.join(" "),
  ]
    .join(" ")
    .toLowerCase();
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

async function fetchPage(args: {
  fetchImpl: typeof fetch;
  page: number;
  remoteOnly: boolean;
}): Promise<JjiOffer[]> {
  const url = new URL(JJI_API_URL);
  url.searchParams.set("page", String(args.page));
  url.searchParams.set("perPage", String(PAGE_SIZE));
  url.searchParams.set("sortBy", "published");
  url.searchParams.set("orderBy", "DESC");
  if (args.remoteOnly) {
    url.searchParams.set("workplaceType", "remote");
  }

  const response = await args.fetchImpl(url.toString(), {
    method: "GET",
    headers: {
      accept: "application/json",
      "version": "2",
    },
  });
  if (!response.ok) {
    throw new Error(`JustJoin.it request failed with ${response.status}`);
  }
  const payload = (await response.json()) as JjiResponse;
  return Array.isArray(payload.data) ? payload.data : [];
}

export async function runJustJoinIt(
  options: RunJjiOptions = {},
): Promise<JjiResult> {
  if (!workplaceMatches(options.workplaceTypes)) {
    return { success: true, jobs: [] };
  }

  const fetchImpl = options.fetchImpl ?? createRateLimitedFetch("justjoinit");
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
    // First page is enough for >70% of cases when remote-only is on.
    // For broader runs we'd add pagination — kept simple here for safety.
    const offers = await fetchPage({
      fetchImpl,
      page: 1,
      remoteOnly,
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
      for (const offer of offers) {
        if (options.shouldCancel?.()) return { success: true, jobs };
        if (jobsFoundTerm >= maxJobsPerTerm) break;
        if (!matchesSearchTerm(offer, searchTerm)) continue;

        const mapped = mapOffer(offer);
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
          : "Unexpected error while running JustJoin.it extractor.";
    return { success: false, jobs: [], error: message };
  }
}
