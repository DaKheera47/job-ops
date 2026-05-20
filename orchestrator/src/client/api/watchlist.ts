import type {
  UpdateWatchlistSelectionsInput,
  WatchlistCheckInput,
  WatchlistCheckResponse,
  WatchlistImportDraftInput,
  WatchlistImportDraftResponse,
  WatchlistJobDetailsInput,
  WatchlistJobDetailsResponse,
  WatchlistJobState,
  WatchlistJobStatesResponse,
  WatchlistResultsResponse,
  WatchlistSourceBrandingInput,
  WatchlistSourceBrandingResponse,
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

export async function recordWatchlistCheck(
  input: WatchlistCheckInput,
): Promise<WatchlistCheckResponse> {
  return fetchApi<WatchlistCheckResponse>("/watchlist/checks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchWatchlistResults(): Promise<WatchlistResultsResponse> {
  return fetchApi<WatchlistResultsResponse>("/watchlist/results", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchWatchlistJobDetails(
  input: WatchlistJobDetailsInput,
): Promise<WatchlistJobDetailsResponse> {
  return fetchApi<WatchlistJobDetailsResponse>("/watchlist/job-details", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function prepareWatchlistImportDraft(
  input: WatchlistImportDraftInput,
): Promise<WatchlistImportDraftResponse> {
  return fetchApi<WatchlistImportDraftResponse>("/watchlist/import-draft", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchWatchlistSourceBranding(
  input: WatchlistSourceBrandingInput,
): Promise<WatchlistSourceBrandingResponse> {
  return fetchApi<WatchlistSourceBrandingResponse>(
    "/watchlist/source-branding",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
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
