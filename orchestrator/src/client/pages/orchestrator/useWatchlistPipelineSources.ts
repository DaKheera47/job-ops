import * as api from "@client/api";
import { queryKeys } from "@client/lib/queryKeys";
import type { WatchlistSelectedSource } from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getAuthScopedStorageKey } from "@/client/api/client";
import { PIPELINE_WATCHLIST_SOURCES_STORAGE_KEY } from "./constants";

export function getWatchlistPipelineSourcesStorageKey(): string {
  return getAuthScopedStorageKey(PIPELINE_WATCHLIST_SOURCES_STORAGE_KEY);
}

type StoredSelection = {
  selectedIds: string[];
  knownIds: string[];
};

function readStoredSelection(storageKey: string): StoredSelection | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const candidate = parsed as Partial<StoredSelection>;
    const selectedIds = Array.isArray(candidate.selectedIds)
      ? candidate.selectedIds.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
    const knownIds = Array.isArray(candidate.knownIds)
      ? candidate.knownIds.filter(
          (value): value is string => typeof value === "string",
        )
      : selectedIds;
    return { selectedIds, knownIds };
  } catch {
    return null;
  }
}

function writeStoredSelection(
  storageKey: string,
  selection: StoredSelection,
): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(selection));
  } catch {
    // Ignore localStorage errors (quota, disabled storage, etc).
  }
}

function reconcileSelection(args: {
  available: WatchlistSelectedSource[];
  stored: StoredSelection | null;
}): { selectedIds: string[]; knownIds: string[] } {
  const availableIds = args.available.map((source) => source.id);
  const availableSet = new Set(availableIds);

  if (!args.stored) {
    // First-run default: include every Watchlist source the user has saved.
    // Preserves the pre-#621 "Watchlist participates automatically" behavior.
    return { selectedIds: availableIds, knownIds: availableIds };
  }

  const previouslyKnown = new Set(args.stored.knownIds);
  // Auto-select sources that appeared since the last reconciliation — they
  // would have been included automatically before #621, so keep them in
  // unless the user later opts out.
  const newlyAddedSelected = availableIds.filter(
    (id) => !previouslyKnown.has(id),
  );

  const selectedIds = [
    ...args.stored.selectedIds.filter((id) => availableSet.has(id)),
    ...newlyAddedSelected,
  ];

  // De-duplicate while preserving order.
  const seen = new Set<string>();
  const deduped = selectedIds.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });

  return { selectedIds: deduped, knownIds: availableIds };
}

export type UseWatchlistPipelineSourcesResult = {
  watchlistSources: WatchlistSelectedSource[];
  selectedWatchlistSourceIds: string[];
  setSelectedWatchlistSourceIds: (ids: string[]) => void;
  toggleWatchlistSource: (sourceId: string, checked: boolean) => void;
  isLoading: boolean;
  isError: boolean;
};

export function useWatchlistPipelineSources(): UseWatchlistPipelineSourcesResult {
  const storageKey = useMemo(() => getWatchlistPipelineSourcesStorageKey(), []);

  const watchlistSourcesQuery = useQuery({
    queryKey: queryKeys.watchlist.sources(),
    queryFn: api.getWatchlistSources,
    staleTime: 30_000,
  });

  const watchlistSources = useMemo(
    () => watchlistSourcesQuery.data?.selectedSources ?? [],
    [watchlistSourcesQuery.data],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const stored = readStoredSelection(storageKey);
    return stored?.selectedIds ?? [];
  });

  // Reconcile against the live list whenever it changes.
  useEffect(() => {
    if (watchlistSourcesQuery.isLoading) return;
    const stored = readStoredSelection(storageKey);
    const reconciled = reconcileSelection({
      available: watchlistSources,
      stored,
    });
    writeStoredSelection(storageKey, reconciled);
    setSelectedIds((current) => {
      if (
        current.length === reconciled.selectedIds.length &&
        current.every((id, index) => id === reconciled.selectedIds[index])
      ) {
        return current;
      }
      return reconciled.selectedIds;
    });
  }, [storageKey, watchlistSources, watchlistSourcesQuery.isLoading]);

  const persistSelection = useCallback(
    (next: string[]) => {
      const availableIds = watchlistSources.map((source) => source.id);
      writeStoredSelection(storageKey, {
        selectedIds: next,
        knownIds: availableIds,
      });
    },
    [storageKey, watchlistSources],
  );

  const setSelectedWatchlistSourceIds = useCallback(
    (ids: string[]) => {
      const availableSet = new Set(watchlistSources.map((source) => source.id));
      const seen = new Set<string>();
      const filtered = ids.filter((id) => {
        if (!availableSet.has(id)) return false;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
      setSelectedIds(filtered);
      persistSelection(filtered);
    },
    [persistSelection, watchlistSources],
  );

  const toggleWatchlistSource = useCallback(
    (sourceId: string, checked: boolean) => {
      setSelectedIds((current) => {
        const availableSet = new Set(
          watchlistSources.map((source) => source.id),
        );
        if (!availableSet.has(sourceId)) return current;
        const next = checked
          ? Array.from(new Set([...current, sourceId]))
          : current.filter((id) => id !== sourceId);
        persistSelection(next);
        return next;
      });
    },
    [persistSelection, watchlistSources],
  );

  return {
    watchlistSources,
    selectedWatchlistSourceIds: selectedIds,
    setSelectedWatchlistSourceIds,
    toggleWatchlistSource,
    isLoading: watchlistSourcesQuery.isLoading,
    isError: watchlistSourcesQuery.isError,
  };
}
