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
import type {
  CreateJobInput,
  ManualJobDraft,
  WatchlistJobResult,
  WatchlistSelectedSource,
} from "@shared/types";

const WATCHLIST_DETAIL_CONCURRENCY = 3;

export type PipelineWatchlistDiscoveryResult = {
  discoveredJobs: CreateJobInput[];
  sourceErrors: string[];
  selectedSourceCount: number;
  failedSourceCount: number;
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

export async function discoverWatchlistJobsForPipeline(
  args: {
    selectedSources?: WatchlistSelectedSource[];
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
    };
  }

  const selectedSources =
    args.selectedSources ?? (await listHydratedWatchlistSelectedSources());
  if (selectedSources.length === 0 || args.shouldCancel?.()) {
    return {
      discoveredJobs: [],
      sourceErrors: [],
      selectedSourceCount: selectedSources.length,
      failedSourceCount: 0,
    };
  }

  logger.info("Fetching Watchlist jobs for pipeline discovery", {
    step: "discover-watchlist-jobs",
    selectedSourceCount: selectedSources.length,
  });

  const results = await getWatchlistResultsForSources(selectedSources);
  const discoveredJobs: CreateJobInput[] = [];
  const sourceErrors: string[] = [];
  let failedSourceCount = 0;

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
      if (job) discoveredJobs.push(job);
    }
  }

  logger.info("Watchlist pipeline discovery complete", {
    step: "discover-watchlist-jobs",
    selectedSourceCount: selectedSources.length,
    failedSourceCount,
    discovered: discoveredJobs.length,
    sourceErrorCount: sourceErrors.length,
  });

  return {
    discoveredJobs,
    sourceErrors,
    selectedSourceCount: selectedSources.length,
    failedSourceCount,
  };
}
