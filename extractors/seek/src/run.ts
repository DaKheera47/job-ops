import type { CreateJobInput } from "@shared/types/jobs";
import { ApifyClient } from "apify-client";

const ACTOR_ID =
  process.env.SEEK_APIFY_ACTOR_ID ?? "unfenced-group/seek-com-au-scraper";

type SeekRawItem = Record<string, unknown>;

export type SeekProgressEvent =
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

export interface RunSeekOptions {
  searchTerms?: string[];
  location?: string;
  country?: string;
  maxJobsPerTerm?: number;
  onProgress?: (event: SeekProgressEvent) => void;
  shouldCancel?: () => boolean;
}

export interface SeekResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

function toStr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function toNum(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function mapSeekItem(
  item: SeekRawItem,
  countryLabel: string,
): CreateJobInput | null {
  const jobUrl = toStr(item.url);
  if (!jobUrl) return null;

  const title = toStr(item.title) ?? "Unknown Title";
  const employer = toStr(item.company) ?? "Unknown Employer";

  const salaryMin = toNum(item.salaryMin);
  const salaryMax = toNum(item.salaryMax);
  const salaryPeriod = toStr(item.salaryPeriod);
  const currency = toStr(item.currency);

  return {
    source: "seek",
    sourceJobId: toStr(item.id),
    title,
    employer,
    jobUrl,
    applicationLink: toStr(item.applyUrl) ?? jobUrl,
    location: toStr(item.location)
      ? `${toStr(item.location)}, ${countryLabel}`
      : undefined,
    salary: toStr(item.salaryLabel),
    salaryMinAmount: salaryMin,
    salaryMaxAmount: salaryMax,
    salaryInterval: salaryPeriod,
    salaryCurrency: currency,
    datePosted: toStr(item.publishDate),
    jobDescription: toStr(item.description),
    jobType: toStr(item.workTypes),
    isRemote: item.workArrangement === "remote" ? true : undefined,
  };
}

export async function runSeek(
  options: RunSeekOptions = {},
): Promise<SeekResult> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token) {
    return {
      success: false,
      jobs: [],
      error: "Missing Apify credentials (APIFY_TOKEN)",
    };
  }

  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const countryLabel =
    options.country === "new zealand" ? "New Zealand" : "Australia";
  const location = options.location ?? `All ${countryLabel}`;
  const maxJobsPerTerm = options.maxJobsPerTerm ?? 50;
  const termTotal = searchTerms.length;

  const client = new ApifyClient({ token });

  try {
    const jobs: CreateJobInput[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < searchTerms.length; i += 1) {
      if (options.shouldCancel?.()) break;

      const searchTerm = searchTerms[i];
      const termIndex = i + 1;

      options.onProgress?.({
        type: "term_start",
        termIndex,
        termTotal,
        searchTerm,
      });

      const run = await client.actor(ACTOR_ID).call({
        searchQuery: searchTerm,
        location,
        maxResults: maxJobsPerTerm,
        fetchDetails: true,
      });

      const { items } = await client
        .dataset(run.defaultDatasetId)
        .listItems({ limit: maxJobsPerTerm });

      let jobsFoundTerm = 0;
      for (const item of items) {
        if (options.shouldCancel?.()) break;
        const mapped = mapSeekItem(item as SeekRawItem, countryLabel);
        if (!mapped) continue;
        const key = mapped.sourceJobId ?? mapped.jobUrl;
        if (seen.has(key)) continue;
        seen.add(key);
        jobs.push(mapped);
        jobsFoundTerm += 1;
      }

      options.onProgress?.({
        type: "term_complete",
        termIndex,
        termTotal,
        searchTerm,
        jobsFoundTerm,
      });
    }

    return { success: true, jobs };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { success: false, jobs: [], error: message };
  }
}
