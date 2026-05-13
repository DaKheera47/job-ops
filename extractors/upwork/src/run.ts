import type { CreateJobInput } from "job-ops-shared/types/jobs";
import { fetchUpworkRss } from "./fetcher";
import { parseUpworkRss } from "./parser";
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
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = toPositiveIntOrFallback(options.maxJobsPerTerm, 10);
  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();

  try {
    for (const [index, searchTerm] of searchTerms.entries()) {
      if (options.shouldCancel?.()) {
        return { success: true, jobs };
      }

      options.onProgress?.({
        type: "term_start",
        termIndex: index + 1,
        termTotal: searchTerms.length,
        searchTerm,
      });

      const xml = await fetchUpworkRss({
        query: searchTerm,
        maxJobsPerTerm,
        fetchImpl: options.fetchImpl,
      });
      let jobsFoundTerm = 0;

      for (const job of parseUpworkRss(xml)) {
        if (options.shouldCancel?.()) {
          return { success: true, jobs };
        }
        if (jobsFoundTerm >= maxJobsPerTerm) break;

        const dedupeKey = job.sourceJobId ?? job.jobUrl;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        jobs.push(job);
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
          : "Unexpected error while running Upwork extractor.";

    return { success: false, jobs: [], error: message };
  }
}
