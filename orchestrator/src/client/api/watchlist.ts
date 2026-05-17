import type {
  UpdateWatchlistSelectionsInput,
  WatchlistJobState,
  WatchlistJobStatesResponse,
  WatchlistSourcesResponse,
} from "@shared/types";
import { fetchApi } from "./core";

function watchlistStatePath(source: string, sourceJobId: string): string {
  return `/watchlist/states/${encodeURIComponent(source)}/${encodeURIComponent(sourceJobId)}`;
}

export async function getWatchlistJobStates(): Promise<WatchlistJobStatesResponse> {
  return fetchApi<WatchlistJobStatesResponse>("/watchlist/states");
}

export async function getWatchlistSources(): Promise<WatchlistSourcesResponse> {
  return fetchApi<WatchlistSourcesResponse>("/watchlist/sources");
}

export async function updateWatchlistSources(
  input: UpdateWatchlistSelectionsInput,
): Promise<WatchlistSourcesResponse> {
  return fetchApi<WatchlistSourcesResponse>("/watchlist/sources", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function ignoreWatchlistJob(input: {
  source: string;
  sourceJobId: string;
}): Promise<{ state: WatchlistJobState }> {
  return fetchApi<{ state: WatchlistJobState }>(
    watchlistStatePath(input.source, input.sourceJobId),
    { method: "PUT" },
  );
}

export async function unignoreWatchlistJob(input: {
  source: string;
  sourceJobId: string;
}): Promise<{ cleared: true }> {
  return fetchApi<{ cleared: true }>(
    watchlistStatePath(input.source, input.sourceJobId),
    { method: "DELETE" },
  );
}
