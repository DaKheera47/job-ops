import { notFound } from "@infra/errors";
import * as jobsRepo from "@server/repositories/jobs";
import * as watchlistRepo from "@server/repositories/watchlist";
import {
  getWatchlistSourceAdapter,
  listWatchlistSourceAdapters,
} from "@server/watchlist/adapters";
import type {
  JobListItem,
  WatchlistCheckResponse,
  WatchlistJobResult,
  WatchlistResultsResponse,
  WatchlistSelectedSource,
  WatchlistSourceResult,
} from "@shared/types";

export const WATCHLIST_SOURCE_TIMEOUT_MS = 30000;

export function getWatchlistSourceTypeDescriptors() {
  return listWatchlistSourceAdapters().map((adapter) => adapter.descriptor);
}

export function hydrateWatchlistSelectedSource(
  source: WatchlistSelectedSource,
): WatchlistSelectedSource {
  const adapter = getWatchlistSourceAdapter(source.sourceType);
  return adapter?.hydrateSelectedSource(source) ?? source;
}

export function hydrateWatchlistSelectedSources(
  selectedSources: WatchlistSelectedSource[],
): WatchlistSelectedSource[] {
  return selectedSources.map(hydrateWatchlistSelectedSource);
}

export async function listHydratedWatchlistSelectedSources(): Promise<
  WatchlistSelectedSource[]
> {
  return hydrateWatchlistSelectedSources(
    await watchlistRepo.listWatchlistSelectedSources(),
  );
}

export async function getWatchlistResultsForSources(
  selectedSources: WatchlistSelectedSource[],
): Promise<WatchlistResultsResponse> {
  if (selectedSources.length === 0) {
    return {
      checkedAt: null,
      previousLastCheckedAt: null,
      sources: [],
    };
  }

  const fetchedSources = await Promise.all(
    selectedSources.map((source) => fetchWatchlistSource(source)),
  );
  const successfulSources = fetchedSources.filter(
    (item): item is Extract<WatchlistSourceResult, { status: "success" }> =>
      item.status === "success",
  );
  const checksBySource = new Map<string, Set<string>>();

  for (const item of successfulSources) {
    for (const job of item.jobs) {
      const sourceJobIds = checksBySource.get(job.source) ?? new Set<string>();
      sourceJobIds.add(job.sourceJobId);
      checksBySource.set(job.source, sourceJobIds);
    }
  }

  const check = await watchlistRepo.recordWatchlistCheck({
    checks: Array.from(checksBySource, ([source, sourceJobIds]) => ({
      source,
      sourceJobIds: Array.from(sourceJobIds),
    })),
  });
  const [states, workspaceJobs] = await Promise.all([
    watchlistRepo.listWatchlistJobStates(),
    jobsRepo.getJobListItems(),
  ]);

  return {
    checkedAt: check.checkedAt,
    previousLastCheckedAt: check.previousLastCheckedAt,
    sources: annotateWatchlistSourceResults({
      sourceResults: fetchedSources,
      check,
      states,
      workspaceJobs,
    }),
  };
}

export async function getCurrentWatchlistResults(): Promise<WatchlistResultsResponse> {
  return getWatchlistResultsForSources(
    await listHydratedWatchlistSelectedSources(),
  );
}

export async function getWatchlistSelectedSourceById(
  selectedSourceId: string,
): Promise<WatchlistSelectedSource> {
  const source = (await listHydratedWatchlistSelectedSources()).find(
    (item) => item.id === selectedSourceId,
  );
  if (!source) {
    throw notFound("Watchlist source was not found");
  }
  return source;
}

export async function fetchWatchlistSource(
  source: WatchlistSelectedSource,
): Promise<WatchlistSourceResult> {
  const adapter = getWatchlistSourceAdapter(source.sourceType);
  if (!adapter) {
    return {
      status: "error",
      source,
      error: `Unsupported watchlist source type: ${source.sourceType}`,
    };
  }

  try {
    const result = await withWatchlistSourceTimeout((signal) =>
      adapter.fetchJobs({ source, signal }),
    );
    return {
      status: "success",
      source,
      jobs: result.jobs.map((job) => ({
        ...job,
        rowState: "new",
        isNewSinceLastCheck: false,
        workspaceJob: null,
      })),
      total: result.total,
      fetched: result.fetched,
    };
  } catch (error) {
    return {
      status: "error",
      source,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function annotateWatchlistSourceResults(input: {
  sourceResults: WatchlistSourceResult[];
  check: WatchlistCheckResponse;
  states: Awaited<ReturnType<typeof watchlistRepo.listWatchlistJobStates>>;
  workspaceJobs: JobListItem[];
}): WatchlistSourceResult[] {
  const ignoredKeys = new Set(
    input.states
      .filter((state) => state.state === "ignored")
      .map((state) => getWatchlistJobKey(state.source, state.sourceJobId)),
  );
  const newJobKeys = new Set(
    input.check.jobs
      .filter((job) => job.isNewSinceLastCheck)
      .map((job) => getWatchlistJobKey(String(job.source), job.sourceJobId)),
  );
  const importedByKey = new Map<string, JobListItem>();
  const importedByUrl = new Map<string, JobListItem>();
  for (const job of input.workspaceJobs) {
    if (job.sourceJobId) {
      importedByKey.set(
        getWatchlistJobKey(String(job.source), job.sourceJobId),
        job,
      );
    }
    importedByUrl.set(job.jobUrl, job);
  }

  return input.sourceResults.map((result) => {
    if (result.status === "error") return result;

    return {
      ...result,
      jobs: result.jobs.map((job): WatchlistJobResult => {
        const jobKey = getWatchlistJobKey(String(job.source), job.sourceJobId);
        const workspaceJob =
          importedByKey.get(jobKey) ?? importedByUrl.get(job.jobUrl) ?? null;
        const rowState = workspaceJob
          ? "moved_to_workspace"
          : ignoredKeys.has(jobKey)
            ? "ignored"
            : "new";

        return {
          ...job,
          rowState,
          isNewSinceLastCheck: rowState === "new" && newJobKeys.has(jobKey),
          workspaceJob: workspaceJob
            ? { id: workspaceJob.id, status: workspaceJob.status }
            : null,
        };
      }),
    };
  });
}

export async function withWatchlistSourceTimeout<T>(
  callback: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    WATCHLIST_SOURCE_TIMEOUT_MS,
  );

  try {
    return await callback(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

export function getWatchlistJobKey(
  source: string,
  sourceJobId: string,
): string {
  return `${source}:${sourceJobId}`;
}
