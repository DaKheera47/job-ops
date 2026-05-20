import * as api from "@client/api";
import { PageHeader, PageMain } from "@client/components/layout";
import { ManualImportSheet } from "@client/components/ManualImportSheet";
import { useSettings } from "@client/hooks/useSettings";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import { createLocationIntentFromLegacyInputs } from "@shared/location-intelligence.js";
import type {
  WatchlistJobResult,
  WatchlistSelectedSource,
  WatchlistSourceTypeDescriptor,
} from "@shared/types.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Accordion } from "@/components/ui/accordion";
import { bucketQueryLength, trackProductEvent } from "@/lib/analytics";
import {
  normalizeWorkplaceTypes,
  parseCityLocationsSetting,
} from "./orchestrator/automatic-run";
import type {
  JobDetailsState,
  SourceSelectionDraft,
  WatchlistFetchState,
  WatchlistImportState,
} from "./watchlist/types";
import {
  createSourceDraft,
  formatWatchlistCheckTimestamp,
  getNormalizedWatchlistCareersUrl,
  getWatchlistSelectionIdentityKey,
  getWorkspaceJobPath,
  normalizeUiCountryKey,
} from "./watchlist/utils";
import { WatchlistSourceResultsCard } from "./watchlist/WatchlistSourceResultsCard";
import { WatchlistSourcesCard } from "./watchlist/WatchlistSourcesCard";

interface DraftSelectionPayload {
  catalogSourceId: string | null;
  sourceType: string;
  label: string;
  careersUrl: string;
}

function getWatchlistSelectionsKey(
  selections: DraftSelectionPayload[],
): string {
  return JSON.stringify(
    selections.map((selection) => getWatchlistSelectionIdentityKey(selection)),
  );
}

function getSourceTypeDescriptor(
  sourceTypes: WatchlistSourceTypeDescriptor[],
  sourceType: string,
): WatchlistSourceTypeDescriptor | null {
  return (
    sourceTypes.find((descriptor) => descriptor.sourceType === sourceType) ??
    sourceTypes[0] ??
    null
  );
}

function getNormalizedSourceKey(value: string): string {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.hostname}${pathname}`;
  } catch {
    return value.trim();
  }
}

function getSourceHost(value: string): string | null {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

export const WatchlistPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const [jobDetails, setJobDetails] = useState<Record<string, JobDetailsState>>(
    {},
  );
  const [importState, setImportState] = useState<WatchlistImportState>({
    open: false,
    draft: null,
    source: null,
    sourceHost: null,
    sourceType: null,
    catalogSourceId: null,
    careersUrl: null,
  });
  const [movingJobRef, setMovingJobRef] = useState<string | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [sourceDrafts, setSourceDrafts] = useState<SourceSelectionDraft[]>([]);

  const { data: watchlistSourcesResponse } = useQuery({
    queryKey: queryKeys.watchlist.sources(),
    queryFn: api.getWatchlistSources,
    staleTime: 30_000,
  });
  const { data: watchlistResultsResponse } = useQuery({
    queryKey: queryKeys.watchlist.results(),
    queryFn: api.fetchWatchlistResults,
    enabled: Boolean(watchlistSourcesResponse?.selectedSources),
    staleTime: 30_000,
  });

  const saveSourcesMutation = useMutation({
    mutationFn: api.updateWatchlistSources,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.watchlist.sources(),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.watchlist.results(),
        }),
      ]);
    },
    onError: (error) => {
      showErrorToast(error, "Failed to save watchlist sources");
    },
  });
  const ignoreMutation = useMutation({
    mutationFn: api.ignoreWatchlistJob,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.watchlist.results(),
      });
    },
    onError: (error) => {
      showErrorToast(error, "Failed to ignore watchlist job");
    },
  });
  const unignoreMutation = useMutation({
    mutationFn: api.unignoreWatchlistJob,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.watchlist.results(),
      });
    },
    onError: (error) => {
      showErrorToast(error, "Failed to restore watchlist job");
    },
  });

  const catalogSources = watchlistSourcesResponse?.catalogSources ?? [];
  const selectedSources = watchlistSourcesResponse?.selectedSources ?? [];
  const sourceTypes = watchlistSourcesResponse?.availableSourceTypes ?? [];
  const defaultSourceType = sourceTypes[0]?.sourceType ?? "workday";

  useEffect(() => {
    const savedSources = watchlistSourcesResponse?.selectedSources ?? [];
    if (savedSources.length === 0) {
      setSourceDrafts([]);
      return;
    }

    setSourceDrafts(
      savedSources.map((source) => ({
        id: source.id,
        isCustom: source.isCustom,
        sourceType: source.sourceType,
        catalogSourceId: source.catalogSourceId,
        customUrl: source.isCustom ? source.careersUrl : "",
      })),
    );
  }, [watchlistSourcesResponse?.selectedSources]);

  const items: WatchlistFetchState[] = useMemo(() => {
    if (selectedSources.length === 0) return [];
    if (watchlistResultsResponse) return watchlistResultsResponse.sources;
    return selectedSources.map((source) => ({ status: "loading", source }));
  }, [selectedSources, watchlistResultsResponse]);

  const sourceStatusByDraftId = useMemo(() => {
    const savedById = new Map(
      selectedSources.map((source) => [source.id, source]),
    );

    return Object.fromEntries(
      sourceDrafts.map((draft) => {
        const savedSource = savedById.get(draft.id);
        if (!savedSource) {
          return [draft.id, "unsaved"] as const;
        }

        const isWatching = draft.isCustom
          ? savedSource.isCustom &&
            savedSource.catalogSourceId === null &&
            savedSource.sourceType === draft.sourceType &&
            getNormalizedWatchlistCareersUrl(
              savedSource.sourceType,
              savedSource.careersUrl,
            ) ===
              getNormalizedWatchlistCareersUrl(
                draft.sourceType,
                draft.customUrl,
              )
          : !savedSource.isCustom &&
            savedSource.catalogSourceId === draft.catalogSourceId;

        return [draft.id, isWatching ? "watching" : "unsaved"] as const;
      }),
    );
  }, [selectedSources, sourceDrafts]);
  const newJobsCount = useMemo(
    () =>
      (watchlistResultsResponse?.sources ?? []).reduce(
        (total, source) =>
          source.status === "success"
            ? total +
              source.jobs.filter((job) => job.isNewSinceLastCheck).length
            : total,
        0,
      ),
    [watchlistResultsResponse?.sources],
  );
  const formattedLastCheckedAt = formatWatchlistCheckTimestamp(
    watchlistResultsResponse?.checkedAt ?? null,
  );
  const formattedPreviousLastCheckedAt = formatWatchlistCheckTimestamp(
    watchlistResultsResponse?.previousLastCheckedAt ?? null,
  );
  const pipelineSearchTerms = settings?.searchTerms.value ?? [];
  const locationIntent = useMemo(
    () =>
      createLocationIntentFromLegacyInputs({
        selectedCountry: normalizeUiCountryKey(
          settings?.jobspyCountryIndeed.value ?? "",
        ),
        cityLocations: parseCityLocationsSetting(settings?.searchCities.value),
        workplaceTypes: normalizeWorkplaceTypes(settings?.workplaceTypes.value),
        searchScope: settings?.locationSearchScope.value,
        matchStrictness: settings?.locationMatchStrictness.value,
      }),
    [settings],
  );

  function addSourceDraft() {
    setSourceDrafts((current) => [
      ...current,
      createSourceDraft({ sourceType: defaultSourceType }),
    ]);
  }

  function removeSourceDraft(index: number) {
    const draft = sourceDrafts[index];
    if (draft) {
      const savedSource = selectedSources.find(
        (source) => source.id === draft.id,
      );
      const selectedCatalogSource =
        draft.catalogSourceId !== null
          ? catalogSources.find((source) => source.id === draft.catalogSourceId)
          : null;
      const careersUrl = draft.isCustom
        ? draft.customUrl.trim()
        : (selectedCatalogSource?.careersUrl ?? savedSource?.careersUrl ?? "");

      trackProductEvent("watchlist_source_removed", {
        source_type:
          selectedCatalogSource?.sourceType ??
          savedSource?.sourceType ??
          draft.sourceType,
        ...(draft.catalogSourceId
          ? { catalog_source_id: draft.catalogSourceId }
          : {}),
        source_url: careersUrl,
      });
    }

    setSourceDrafts((current) =>
      current.filter((_, draftIndex) => draftIndex !== index),
    );
  }

  function updateDraft(
    index: number,
    updater: (draft: SourceSelectionDraft) => SourceSelectionDraft,
  ) {
    setSourceDrafts((current) =>
      current.map((draft, draftIndex) =>
        draftIndex === index ? updater(draft) : draft,
      ),
    );
  }

  const draftSelectionsState = useMemo(() => {
    const selections: DraftSelectionPayload[] = [];

    for (const [index, draft] of sourceDrafts.entries()) {
      if (draft.isCustom) {
        const careersUrl = getNormalizedWatchlistCareersUrl(
          draft.sourceType,
          draft.customUrl,
        );
        if (!careersUrl) {
          const descriptor = getSourceTypeDescriptor(
            sourceTypes,
            draft.sourceType,
          );
          return {
            selections: null,
            error: new Error(
              `Source ${index + 1} is missing a ${
                descriptor?.customSourceInputLabel ?? "custom source URL"
              }.`,
            ),
          };
        }

        selections.push({
          catalogSourceId: null,
          sourceType: draft.sourceType,
          label: careersUrl,
          careersUrl,
        });
        continue;
      }

      if (!draft.catalogSourceId) {
        return {
          selections: null,
          error: new Error(`Source ${index + 1} is not selected.`),
        };
      }

      const catalogSource = catalogSources.find(
        (source) => source.id === draft.catalogSourceId,
      );
      if (!catalogSource) {
        return {
          selections: null,
          error: new Error(`Source ${index + 1} is no longer available.`),
        };
      }

      selections.push({
        catalogSourceId: catalogSource.id,
        sourceType: catalogSource.sourceType,
        label: catalogSource.label,
        careersUrl: catalogSource.careersUrl,
      });
    }

    const uniqueUrls = new Set(
      selections.map((selection) => selection.careersUrl),
    );
    if (uniqueUrls.size !== selections.length) {
      return {
        selections: null,
        error: new Error("Choose unique watchlist URLs."),
      };
    }

    return {
      selections,
      error: null,
    };
  }, [catalogSources, sourceDrafts, sourceTypes]);
  const persistedSelectionsKey = useMemo(
    () =>
      getWatchlistSelectionsKey(
        selectedSources.map((source) => ({
          catalogSourceId: source.catalogSourceId,
          sourceType: source.sourceType,
          label: source.label,
          careersUrl: getNormalizedWatchlistCareersUrl(
            source.sourceType,
            source.careersUrl,
          ),
        })),
      ),
    [selectedSources],
  );
  const draftSelectionsKey = useMemo(
    () =>
      draftSelectionsState.selections
        ? getWatchlistSelectionsKey(draftSelectionsState.selections)
        : null,
    [draftSelectionsState],
  );
  const hasDraftLevelUnsavedChanges = useMemo(
    () =>
      selectedSources.length !== sourceDrafts.length ||
      sourceDrafts.some(
        (draft) => sourceStatusByDraftId[draft.id] !== "watching",
      ),
    [selectedSources.length, sourceDrafts, sourceStatusByDraftId],
  );
  const hasUnsavedChanges = useMemo(() => {
    if (!watchlistSourcesResponse?.selectedSources) {
      return false;
    }
    if (!draftSelectionsState.selections) {
      return hasDraftLevelUnsavedChanges;
    }
    return draftSelectionsKey !== persistedSelectionsKey;
  }, [
    draftSelectionsKey,
    draftSelectionsState.selections,
    hasDraftLevelUnsavedChanges,
    persistedSelectionsKey,
    watchlistSourcesResponse?.selectedSources,
  ]);

  async function handleSaveSources() {
    if (draftSelectionsState.error) {
      const customDraft = sourceDrafts.find((draft) => draft.isCustom);
      if (customDraft?.customUrl.trim()) {
        trackProductEvent("watchlist_url_validation_failed", {
          source_type: customDraft.sourceType,
          source_url: customDraft.customUrl.trim(),
          error_message: draftSelectionsState.error.message,
        });
      }
      throw draftSelectionsState.error;
    }

    if (!draftSelectionsState.selections || !hasUnsavedChanges) {
      return;
    }

    const selections = draftSelectionsState.selections;
    try {
      await saveSourcesMutation.mutateAsync({ selections });

      const catalogCount = selections.filter(
        (selection) => selection.catalogSourceId !== null,
      ).length;
      const customSelections = selections.filter(
        (selection) => selection.catalogSourceId === null,
      );
      const customCount = customSelections.length;

      trackProductEvent("watchlist_sources_saved", {
        source_count: selections.length,
        catalog_count: catalogCount,
        custom_count: customCount,
      });

      for (const selection of customSelections) {
        trackProductEvent("watchlist_custom_url_saved", {
          source_type: selection.sourceType,
          source_url: selection.careersUrl,
          normalized_source_key: getNormalizedSourceKey(selection.careersUrl),
          host: getSourceHost(selection.careersUrl) ?? "unknown",
        });
      }
    } catch (error) {
      const customDraft = sourceDrafts.find((draft) => draft.isCustom);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (customDraft?.customUrl.trim()) {
        trackProductEvent("watchlist_url_validation_failed", {
          source_type: customDraft.sourceType,
          source_url: customDraft.customUrl.trim(),
          error_message: errorMessage,
        });
      }
      throw error;
    }
  }

  async function loadJobDetails(
    job: WatchlistJobResult,
    source: WatchlistSelectedSource,
  ) {
    const existing = jobDetails[job.jobRef];
    if (existing?.status === "success") return existing.details;

    setJobDetails((current) => ({
      ...current,
      [job.jobRef]: { status: "loading" },
    }));

    try {
      const details = await api.fetchWatchlistJobDetails({
        selectedSourceId: source.id,
        jobRef: job.jobRef,
      });

      setJobDetails((current) => ({
        ...current,
        [job.jobRef]: {
          status: "success",
          details,
        },
      }));
      return details;
    } catch (error) {
      setJobDetails((current) => ({
        ...current,
        [job.jobRef]: {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      }));
      return null;
    }
  }

  async function handleMoveToWorkspace(
    job: WatchlistJobResult,
    source: WatchlistSelectedSource,
  ) {
    try {
      setMovingJobRef(job.jobRef);
      const response = await api.prepareWatchlistImportDraft({
        selectedSourceId: source.id,
        jobRef: job.jobRef,
      });
      setImportState({
        open: true,
        draft: response.draft,
        source: response.source,
        sourceHost: response.sourceHost,
        sourceType: response.sourceType,
        catalogSourceId: response.catalogSourceId,
        careersUrl: response.careersUrl,
      });
    } catch (error) {
      showErrorToast(error, "Failed to prepare watchlist job");
    } finally {
      setMovingJobRef(null);
    }
  }

  function handleWatchlistSourceMethodSelected(input: {
    method: "catalog" | "custom_url";
    catalogSourceId?: string;
    sourceType?: string;
    careersUrl?: string;
  }) {
    trackProductEvent("watchlist_source_add_method_selected", {
      method: input.method,
      ...(input.catalogSourceId
        ? { catalog_source_id: input.catalogSourceId }
        : {}),
      ...(input.sourceType ? { source_type: input.sourceType } : {}),
      ...(input.careersUrl ? { source_url: input.careersUrl } : {}),
    });
  }

  function handleWatchlistSourceSearchNoResults(input: { searchText: string }) {
    trackProductEvent("watchlist_source_search_no_results", {
      search_text: input.searchText,
      search_length_bucket: bucketQueryLength(input.searchText),
    });
  }

  function handleIgnoreWatchlistJob(input: {
    source: string;
    sourceJobId: string;
  }) {
    const selectedSource = items.find(
      (item) =>
        item.status === "success" &&
        item.jobs.some(
          (job) =>
            job.source === input.source &&
            job.sourceJobId === input.sourceJobId,
        ),
    )?.source;

    trackProductEvent("watchlist_job_ignored", {
      source_type: selectedSource?.sourceType ?? "unknown",
      ...(selectedSource?.catalogSourceId
        ? { catalog_source_id: selectedSource.catalogSourceId }
        : {}),
      source_url: selectedSource?.careersUrl ?? input.source,
    });

    ignoreMutation.mutate(input);
  }

  return (
    <>
      <PageHeader
        icon={Eye}
        title="Watchlist"
        subtitle="Career pages you're watching"
      />

      <PageMain>
        <div className="space-y-3">
          <WatchlistSourcesCard
            sourceDrafts={sourceDrafts}
            sourceStatusByDraftId={sourceStatusByDraftId}
            catalogSources={catalogSources}
            sourceTypes={sourceTypes}
            formattedLastCheckedAt={formattedLastCheckedAt}
            formattedPreviousLastCheckedAt={formattedPreviousLastCheckedAt}
            newJobsCount={newJobsCount}
            hasUnsavedChanges={hasUnsavedChanges}
            isSaving={saveSourcesMutation.isPending}
            onAddSource={addSourceDraft}
            onRemoveSource={removeSourceDraft}
            onUpdateDraft={updateDraft}
            onSourceMethodSelected={handleWatchlistSourceMethodSelected}
            onSourceSearchNoResults={handleWatchlistSourceSearchNoResults}
            onSave={() => {
              void handleSaveSources().catch((error) => {
                showErrorToast(error, "Failed to save watchlist sources");
              });
            }}
          />

          <Accordion
            type="single"
            collapsible
            className="overflow-hidden rounded-lg border bg-card"
          >
            {items.map((item) => (
              <WatchlistSourceResultsCard
                key={item.source.id}
                item={item}
                sourceTypes={sourceTypes}
                pipelineSearchTerms={pipelineSearchTerms}
                locationIntent={locationIntent}
                showIgnored={showIgnored}
                setShowIgnored={setShowIgnored}
                jobDetails={jobDetails}
                movingJobRef={movingJobRef}
                ignorePending={ignoreMutation.isPending}
                ignoreVariables={ignoreMutation.variables}
                unignorePending={unignoreMutation.isPending}
                unignoreVariables={unignoreMutation.variables}
                onIgnore={handleIgnoreWatchlistJob}
                onUnignore={(input) => unignoreMutation.mutate(input)}
                onMoveToWorkspace={(job, source) => {
                  void handleMoveToWorkspace(job, source);
                }}
                onOpenWorkspaceJob={(job) => navigate(getWorkspaceJobPath(job))}
                onLoadJobDetails={(job, source) => {
                  void loadJobDetails(job, source);
                }}
              />
            ))}
          </Accordion>
        </div>
      </PageMain>

      <ManualImportSheet
        open={importState.open}
        onOpenChange={(open) =>
          setImportState((current) => ({
            ...current,
            open,
            draft: open ? current.draft : null,
            source: open ? current.source : null,
            sourceHost: open ? current.sourceHost : null,
            sourceType: open ? current.sourceType : null,
            catalogSourceId: open ? current.catalogSourceId : null,
            careersUrl: open ? current.careersUrl : null,
          }))
        }
        onImported={async (result) => {
          if (importState.careersUrl) {
            trackProductEvent("watchlist_job_moved_to_workspace", {
              source_type: importState.sourceType ?? "unknown",
              ...(importState.catalogSourceId
                ? { catalog_source_id: importState.catalogSourceId }
                : {}),
              source_url: importState.careersUrl,
            });
          }
          await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
          await queryClient.invalidateQueries({
            queryKey: queryKeys.watchlist.results(),
          });
          await queryClient.fetchQuery({
            queryKey: queryKeys.jobs.list({ view: "list" }),
            queryFn: () => api.getJobs({ view: "list" }),
            staleTime: 0,
          });
          navigate(`/jobs/ready/${result.jobId}`, {
            state: { refreshJobsAt: Date.now() },
          });
        }}
        initialDraft={importState.draft}
        initialSource={importState.source}
        initialSourceHost={importState.sourceHost}
      />
    </>
  );
};
