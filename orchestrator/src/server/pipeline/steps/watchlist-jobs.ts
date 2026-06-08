import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { getUserId } from "@server/infra/request-context";
import { asyncPool } from "@server/utils/async-pool";
import { getWatchlistSourceAdapter } from "@server/watchlist/adapters";
import {
  getWatchlistResultsForSources,
  listHydratedWatchlistSelectedSources,
  withWatchlistSourceTimeout,
} from "@server/watchlist/results";
import { normalizeJobTitle } from "@shared/job-matching.js";
import type {
  CreateJobInput,
  ManualJobDraft,
  WatchlistJobResult,
  WatchlistSelectedSource,
} from "@shared/types";
import { normalizeSearchTerms } from "@shared/utils/search-terms";

const WATCHLIST_DETAIL_CONCURRENCY = 3;

export type PipelineWatchlistDiscoveryResult = {
  discoveredJobs: CreateJobInput[];
  sourceErrors: string[];
  selectedSourceCount: number;
  failedSourceCount: number;
  searchFilteredCount: number;
};

function optionalString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function buildWatchlistSourceError(
  source: Pick<WatchlistSelectedSource, "label" | "sourceType">,
  reason: string,
): string {
  const label = source.label.trim() || source.sourceType;
  return `Watchlist ${label}: ${reason}`;
}

function createJobInputFromWatchlistJob(
  job: WatchlistJobResult,
  draft: ManualJobDraft,
): CreateJobInput {
  return {
    source: draft.source ?? job.source,
    sourceJobId: draft.sourceJobId ?? job.sourceJobId,
    title: draft.title ?? job.title,
    employer: draft.employer ?? job.employer,
    jobUrl: draft.jobUrl ?? job.jobUrl,
    applicationLink: optionalString(
      draft.applicationLink ?? job.applicationLink,
    ),
    location: optionalString(draft.location ?? job.location),
    datePosted: optionalString(job.postedAt),
    jobDescription: optionalString(draft.jobDescription),
    jobType: optionalString(draft.jobType),
    jobLevel: optionalString(draft.jobLevel),
    jobFunction: optionalString(draft.jobFunction),
    disciplines: optionalString(draft.disciplines),
    degreeRequired: optionalString(draft.degreeRequired),
    starting: optionalString(draft.starting),
    deadline: optionalString(draft.deadline),
    salary: optionalString(draft.salary),
  };
}

function getWatchlistSearchText(job: CreateJobInput): string {
  return normalizeJobTitle(
    [
      job.title,
      job.jobDescription,
      job.jobFunction,
      job.jobType,
      job.disciplines,
      job.skills,
    ]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(" "),
  );
}

function matchesWatchlistSearchTerms(
  job: CreateJobInput,
  searchTerms: readonly string[],
): boolean {
  const normalizedTerms = normalizeSearchTerms([...searchTerms])
    .map((term) => normalizeJobTitle(term))
    .filter(Boolean);
  if (normalizedTerms.length === 0) return true;

  const searchableText = getWatchlistSearchText(job);
  if (!searchableText) return false;

  return normalizedTerms.some((term) => searchableText.includes(term));
}

export async function discoverWatchlistJobsForPipeline(
  args: {
    selectedSources?: WatchlistSelectedSource[];
    searchTerms?: string[];
    shouldCancel?: () => boolean;
  } = {},
): Promise<PipelineWatchlistDiscoveryResult> {
  if (!getUserId()) {
    logger.info("Skipping Watchlist pipeline discovery without user context", {
      step: "discover-watchlist-jobs",
    });
    return {
      discoveredJobs: [],
      sourceErrors: [],
      selectedSourceCount: 0,
      failedSourceCount: 0,
      searchFilteredCount: 0,
    };
  }

  const selectedSources =
    args.selectedSources ?? (await listHydratedWatchlistSelectedSources());
  const searchTerms = normalizeSearchTerms(args.searchTerms ?? []);
  if (selectedSources.length === 0 || args.shouldCancel?.()) {
    return {
      discoveredJobs: [],
      sourceErrors: [],
      selectedSourceCount: selectedSources.length,
      failedSourceCount: 0,
      searchFilteredCount: 0,
    };
  }

  logger.info("Fetching Watchlist jobs for pipeline discovery", {
    step: "discover-watchlist-jobs",
    selectedSourceCount: selectedSources.length,
    searchTermCount: searchTerms.length,
  });

  const results = await getWatchlistResultsForSources(selectedSources);
  const discoveredJobs: CreateJobInput[] = [];
  const sourceErrors: string[] = [];
  let failedSourceCount = 0;
  let searchFilteredCount = 0;

  for (const result of results.sources) {
    if (result.status === "error") {
      failedSourceCount += 1;
      sourceErrors.push(
        buildWatchlistSourceError(result.source, "failed to fetch jobs"),
      );
      logger.warn("Watchlist source failed during pipeline discovery", {
        step: "discover-watchlist-jobs",
        selectedSourceId: result.source.id,
        sourceType: result.source.sourceType,
        error: result.error,
      });
      continue;
    }

    const adapter = getWatchlistSourceAdapter(result.source.sourceType);
    if (!adapter) {
      failedSourceCount += 1;
      sourceErrors.push(
        buildWatchlistSourceError(result.source, "unsupported source type"),
      );
      continue;
    }

    const jobsToImport = result.jobs.filter((job) => job.rowState === "new");
    const detailResults = await asyncPool({
      items: jobsToImport,
      concurrency: WATCHLIST_DETAIL_CONCURRENCY,
      shouldStop: args.shouldCancel,
      task: async (job) => {
        if (args.shouldCancel?.()) return null;

        try {
          const importDraft = await withWatchlistSourceTimeout((signal) =>
            adapter.prepareImportDraft({
              source: result.source,
              jobRef: job.jobRef,
              signal,
            }),
          );
          return createJobInputFromWatchlistJob(job, importDraft.draft);
        } catch (error) {
          logger.warn("Watchlist job detail fetch failed during discovery", {
            step: "discover-watchlist-jobs",
            selectedSourceId: result.source.id,
            sourceType: result.source.sourceType,
            source: job.source,
            sourceJobId: job.sourceJobId,
            error: sanitizeUnknown(error),
          });
          sourceErrors.push(
            buildWatchlistSourceError(
              result.source,
              `failed to fetch details for ${job.sourceJobId}`,
            ),
          );
          return null;
        }
      },
    });

    for (const job of detailResults) {
      if (!job) continue;
      if (matchesWatchlistSearchTerms(job, searchTerms)) {
        discoveredJobs.push(job);
      } else {
        searchFilteredCount += 1;
      }
    }
  }

  logger.info("Watchlist pipeline discovery complete", {
    step: "discover-watchlist-jobs",
    selectedSourceCount: selectedSources.length,
    failedSourceCount,
    matchedCount: discoveredJobs.length,
    searchFilteredCount,
    searchTermCount: searchTerms.length,
    sourceErrorCount: sourceErrors.length,
  });

  return {
    discoveredJobs,
    sourceErrors,
    selectedSourceCount: selectedSources.length,
    failedSourceCount,
    searchFilteredCount,
  };
}
