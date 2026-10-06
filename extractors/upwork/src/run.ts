import type { CreateJobInput } from "job-ops-shared/types/jobs";
import { fetchUpworkApifyItems } from "./fetcher";
import { parseUpworkItems } from "./parser";
import type { RunUpworkOptions } from "./types";

export interface UpworkResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

function toPositiveIntOrFallback(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value as number));
}

export async function runUpwork(
  options: RunUpworkOptions = {},
): Promise<UpworkResult> {
  const token = process.env.APIFY_TOKEN?.trim();
  if (!token && !options.apifyClient) {
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
  const maxJobsPerTerm = toPositiveIntOrFallback(options.maxJobsPerTerm, 50);
  const termTotal = searchTerms.length;

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

      const items = await fetchUpworkApifyItems({
        query: searchTerm,
        location: options.location,
        maxJobsPerTerm,
        token,
        actorId: options.actorId,
        client: options.apifyClient,
      });

      let jobsFoundTerm = 0;
      for (const job of parseUpworkItems(items)) {
        if (options.shouldCancel?.()) break;
        if (jobsFoundTerm >= maxJobsPerTerm) break;

        const dedupeKey = job.sourceJobId ?? job.jobUrl;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        jobs.push(job);
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
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unexpected error while running Upwork extractor.";

    return { success: false, jobs: [], error: message };
  }
}
