import type { CreateJobInput } from "job-ops-shared/types/jobs";
import { fetchFiveamsatSearchPage } from "./fetcher";
import { parseFiveamsatServices } from "./parser";
import type { RunFiveamsatOptions } from "./types";

export interface FiveamsatResult {
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

export async function runFiveamsat(
  options: RunFiveamsatOptions = {},
): Promise<FiveamsatResult> {
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = toPositiveIntOrFallback(options.maxJobsPerTerm, 25);
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

      const html = await fetchFiveamsatSearchPage({
        query: searchTerm,
        fetchImpl: options.fetchImpl,
      });
      let jobsFoundTerm = 0;

      for (const job of parseFiveamsatServices(html)) {
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
          : "Unexpected error while running Khamsat extractor.";

    return { success: false, jobs: [], error: message };
  }
}
