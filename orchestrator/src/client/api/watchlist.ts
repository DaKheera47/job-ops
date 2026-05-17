import type {
  WatchlistJobState,
  WatchlistJobStatesResponse,
} from "@shared/types";
import { fetchApi } from "./core";

function watchlistStatePath(source: string, sourceJobId: string): string {
  return `/watchlist/states/${encodeURIComponent(source)}/${encodeURIComponent(sourceJobId)}`;
}

export async function getWatchlistJobStates(): Promise<WatchlistJobStatesResponse> {
  return fetchApi<WatchlistJobStatesResponse>("/watchlist/states");
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
