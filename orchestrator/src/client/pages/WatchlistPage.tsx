import * as api from "@client/api";
import {
  fetchWorkdayCxsJobDetails,
  fetchWorkdayCxsJobs,
  type NormalizedWorkdayJob,
  type NormalizedWorkdayJobDetails,
} from "@client/api/workday";
import { PageHeader, PageMain } from "@client/components/layout";
import { ManualImportSheet } from "@client/components/ManualImportSheet";
import { useSettings } from "@client/hooks/useSettings";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import { createLocationIntentFromLegacyInputs } from "@shared/location-intelligence.js";
import type { JobListItem, WatchlistSelectedSource } from "@shared/types.js";
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
  WatchlistCheckState,
  WatchlistFetchState,
  WatchlistRowState,
  WorkdayImportState,
} from "./watchlist/types";
import {
  buildManualDraftFromWorkdayJob,
  createSourceDraft,
  formatWatchlistCheckTimestamp,
  getSourceHost,
  getWorkdayImportKey,
  getWorkspaceJobPath,
  normalizeUiCountryKey,
  toWorkdaySource,
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
    selections.map((selection) => ({
      catalogSourceId: selection.catalogSourceId,
      sourceType: selection.sourceType,
      label: selection.label,
      careersUrl: selection.careersUrl,
    })),
  );
}

function getWorkdayHost(value: string): string | null {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function getWorkdayTenantSlug(value: string): string | null {
  const host = getWorkdayHost(value);
  if (!host) return null;
  const [tenantSlug] = host.split(".");
  return tenantSlug?.trim() || null;
}

function getNormalizedWorkdayKey(value: string): string {
  try {
    const parsed = new URL(value);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.hostname}${pathname}`;
  } catch {
    return value.trim();
  }
}

export const WatchlistPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const [items, setItems] = useState<WatchlistFetchState[]>([]);
  const [jobDetails, setJobDetails] = useState<Record<string, JobDetailsState>>(
    {},
  );
  const [importState, setImportState] = useState<WorkdayImportState>({
    open: false,
    draft: null,
    source: null,
    sourceHost: null,
    workdaySource: null,
    sourceType: null,
    catalogSourceId: null,
  });
  const [movingJobUrl, setMovingJobUrl] = useState<string | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [sourceDrafts, setSourceDrafts] = useState<SourceSelectionDraft[]>([]);
  const [watchlistCheckState, setWatchlistCheckState] =
    useState<WatchlistCheckState>({
      checkedAt: null,
      previousLastCheckedAt: null,
      newJobKeys: new Set(),
    });

  const { data: workspaceJobsResponse } = useQuery({
    queryKey: queryKeys.jobs.list({ view: "list" }),
    queryFn: () => api.getJobs({ view: "list" }),
    staleTime: 30_000,
  });
  const { data: watchlistStatesResponse } = useQuery({
    queryKey: queryKeys.watchlist.states(),
    queryFn: api.getWatchlistJobStates,
    staleTime: 30_000,
  });
  const { data: watchlistSourcesResponse } = useQuery({
    queryKey: queryKeys.watchlist.sources(),
    queryFn: api.getWatchlistSources,
    staleTime: 30_000,
  });

  const saveSourcesMutation = useMutation({
    mutationFn: api.updateWatchlistSources,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.watchlist.sources(),
      });
    },
    onError: (error) => {
      showErrorToast(error, "Failed to save watchlist sources");
    },
  });
  const ignoreMutation = useMutation({
    mutationFn: api.ignoreWatchlistJob,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.watchlist.states(),
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
        queryKey: queryKeys.watchlist.states(),
      });
    },
    onError: (error) => {
      showErrorToast(error, "Failed to restore watchlist job");
    },
  });

  useEffect(() => {
    let cancelled = false;

    async function fetchWatchlist() {
      const sources = watchlistSourcesResponse?.selectedSources ?? [];
      const enabledSources = sources.filter(
        (source) => source.sourceType === "workday",
      );

      if (enabledSources.length === 0) {
        setItems([]);
        setWatchlistCheckState({
          checkedAt: null,
          previousLastCheckedAt: null,
          newJobKeys: new Set(),
        });
        return;
      }

      setWatchlistCheckState((current) => ({
        ...current,
        newJobKeys: new Set(),
      }));

      setItems(
        enabledSources.map((source) => ({
          status: "loading",
          source,
        })),
      );

      const checks: Array<{ source: string; sourceJobIds: string[] }> = [];

      await Promise.all(
        enabledSources.map(async (source) => {
          try {
            const result = await fetchWorkdayCxsJobs(source.careersUrl, 40);

            if (cancelled) return;

            checks.push({
              source: toWorkdaySource(result.cxsJobsUrl || source.careersUrl),
              sourceJobIds: result.response.jobs.map((job) => job.externalId),
            });

            setItems((current) =>
              current.map((item) =>
                item.source.id === source.id
                  ? { status: "success", source, response: result.response }
                  : item,
              ),
            );
          } catch (error) {
            if (cancelled) return;

            setItems((current) =>
              current.map((item) =>
                item.source.id === source.id
                  ? {
                      status: "error",
                      source,
                      error:
                        error instanceof Error ? error.message : String(error),
                    }
                  : item,
              ),
            );
          }
        }),
      );

      if (cancelled || checks.length === 0) return;

      try {
        const check = await api.recordWatchlistCheck({ checks });
        if (cancelled) return;

        const jobsCount = checks.reduce(
          (total, entry) => total + entry.sourceJobIds.length,
          0,
        );
        const newJobsCount = check.jobs.filter(
          (job) => job.isNewSinceLastCheck,
        ).length;

        trackProductEvent("watchlist_check_completed", {
          source_count: enabledSources.length,
          jobs_count: jobsCount,
          new_jobs_count: newJobsCount,
        });
        if (newJobsCount > 0) {
          trackProductEvent("watchlist_new_jobs_detected", {
            source_count: enabledSources.length,
            new_jobs_count: newJobsCount,
          });
        }
        if (jobsCount === 0) {
          trackProductEvent("watchlist_no_jobs_returned", {
            source_count: enabledSources.length,
          });
        }

        setWatchlistCheckState({
          checkedAt: check.checkedAt,
          previousLastCheckedAt: check.previousLastCheckedAt,
          newJobKeys: new Set(
            check.jobs
              .filter((job) => job.isNewSinceLastCheck)
              .map((job) =>
                getWorkdayImportKey(String(job.source), job.sourceJobId),
              ),
          ),
        });
      } catch (error) {
        if (cancelled) return;
        showErrorToast(error, "Failed to update watchlist check");
      }
    }

    if (watchlistSourcesResponse?.selectedSources) {
      void fetchWatchlist();
    }

    return () => {
      cancelled = true;
    };
  }, [watchlistSourcesResponse?.selectedSources]);

  useEffect(() => {
    const selectedSources = watchlistSourcesResponse?.selectedSources ?? [];
    if (selectedSources.length === 0) {
      setSourceDrafts([]);
      return;
    }

    setSourceDrafts(
      selectedSources.map((source) => ({
        id: source.id,
        isCustom: source.isCustom,
        catalogSourceId: source.catalogSourceId,
        customUrl: source.isCustom ? source.careersUrl : "",
      })),
    );
  }, [watchlistSourcesResponse?.selectedSources]);

  const catalogSources = watchlistSourcesResponse?.catalogSources ?? [];
  const selectedSources = watchlistSourcesResponse?.selectedSources ?? [];
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
            savedSource.careersUrl === draft.customUrl.trim()
          : !savedSource.isCustom &&
            savedSource.catalogSourceId === draft.catalogSourceId;

        return [draft.id, isWatching ? "watching" : "unsaved"] as const;
      }),
    );
  }, [selectedSources, sourceDrafts]);
  const newJobsCount = watchlistCheckState.newJobKeys.size;
  const formattedLastCheckedAt = formatWatchlistCheckTimestamp(
    watchlistCheckState.checkedAt,
  );
  const formattedPreviousLastCheckedAt = formatWatchlistCheckTimestamp(
    watchlistCheckState.previousLastCheckedAt,
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

  const importedJobsByWorkdayKey = useMemo(() => {
    const importedJobs = new Map<string, JobListItem>();
    for (const job of workspaceJobsResponse?.jobs ?? []) {
      if (!job.sourceJobId || !String(job.source).startsWith("workday:")) {
        continue;
      }
      importedJobs.set(
        getWorkdayImportKey(String(job.source), job.sourceJobId),
        job,
      );
    }
    return importedJobs;
  }, [workspaceJobsResponse?.jobs]);

  const ignoredWorkdayKeys = useMemo(() => {
    const ignoredKeys = new Set<string>();
    for (const state of watchlistStatesResponse?.states ?? []) {
      if (state.state !== "ignored") continue;
      ignoredKeys.add(
        getWorkdayImportKey(String(state.source), state.sourceJobId),
      );
    }
    return ignoredKeys;
  }, [watchlistStatesResponse?.states]);

  function getImportedWorkdayJob(
    workdayJob: NormalizedWorkdayJob,
    cxsJobsUrl: string,
  ): JobListItem | undefined {
    const source = toWorkdaySource(cxsJobsUrl);
    return (
      importedJobsByWorkdayKey.get(
        getWorkdayImportKey(source, workdayJob.externalId),
      ) ??
      workspaceJobsResponse?.jobs.find(
        (workspaceJob) => workspaceJob.jobUrl === workdayJob.jobUrl,
      )
    );
  }

  function getWorkdayRowState(
    workdayJob: NormalizedWorkdayJob,
    cxsJobsUrl: string,
  ): WatchlistRowState {
    if (getImportedWorkdayJob(workdayJob, cxsJobsUrl)) {
      return "moved_to_workspace";
    }
    const source = toWorkdaySource(cxsJobsUrl);
    return ignoredWorkdayKeys.has(
      getWorkdayImportKey(source, workdayJob.externalId),
    )
      ? "ignored"
      : "new";
  }

  function getWorkdayStateInput(
    workdayJob: NormalizedWorkdayJob,
    cxsJobsUrl: string,
  ) {
    return {
      source: toWorkdaySource(cxsJobsUrl),
      sourceJobId: workdayJob.externalId,
    };
  }

  function addSourceDraft() {
    setSourceDrafts((current) => [...current, createSourceDraft()]);
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
      const workdaySource = draft.isCustom
        ? draft.customUrl.trim()
        : (selectedCatalogSource?.careersUrl ?? savedSource?.careersUrl ?? "");

      trackProductEvent("watchlist_source_removed", {
        source_type: "workday",
        ...(draft.catalogSourceId
          ? { catalog_source_id: draft.catalogSourceId }
          : {}),
        workday_source: workdaySource,
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
        const careersUrl = draft.customUrl.trim();
        if (!careersUrl) {
          return {
            selections: null,
            error: new Error(`Source ${index + 1} is missing a Workday URL.`),
          };
        }

        selections.push({
          catalogSourceId: null,
          sourceType: "workday",
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
  }, [catalogSources, sourceDrafts]);
  const persistedSelectionsKey = useMemo(
    () =>
      getWatchlistSelectionsKey(
        selectedSources.map((source) => ({
          catalogSourceId: source.catalogSourceId,
          sourceType: source.sourceType,
          label: source.label,
          careersUrl: source.careersUrl,
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
      const isUrlValidationError = /workday|url/i.test(
        draftSelectionsState.error.message,
      );
      if (customDraft?.customUrl.trim() && isUrlValidationError) {
        trackProductEvent("watchlist_url_validation_failed", {
          source_type: "workday",
          workday_source: customDraft.customUrl.trim(),
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
        const workdaySource = selection.careersUrl;
        trackProductEvent("watchlist_custom_url_saved", {
          workday_source: workdaySource,
          normalized_workday_key: getNormalizedWorkdayKey(workdaySource),
          host: getWorkdayHost(workdaySource) ?? "unknown",
          ...(getWorkdayTenantSlug(workdaySource)
            ? { tenant_slug: getWorkdayTenantSlug(workdaySource) ?? undefined }
            : {}),
        });
      }
    } catch (error) {
      const customDraft = sourceDrafts.find((draft) => draft.isCustom);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (customDraft?.customUrl.trim() && /workday|url/i.test(errorMessage)) {
        trackProductEvent("watchlist_url_validation_failed", {
          source_type: "workday",
          workday_source: customDraft.customUrl.trim(),
          error_message: errorMessage,
        });
      }
      throw error;
    }
  }

  async function loadJobDetails(
    jobUrl: string,
  ): Promise<NormalizedWorkdayJobDetails | null> {
    const existing = jobDetails[jobUrl];
    if (existing?.status === "success") return existing.details;

    setJobDetails((current) => ({
      ...current,
      [jobUrl]: { status: "loading" },
    }));

    try {
      const result = await fetchWorkdayCxsJobDetails(jobUrl);

      setJobDetails((current) => ({
        ...current,
        [jobUrl]: {
          status: "success",
          details: result.response.job,
        },
      }));
      return result.response.job;
    } catch (error) {
      setJobDetails((current) => ({
        ...current,
        [jobUrl]: {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      }));
      return null;
    }
  }

  async function handleMoveToWorkspace(
    job: NormalizedWorkdayJob,
    source: WatchlistSelectedSource,
  ) {
    try {
      setMovingJobUrl(job.jobUrl);
      const details = await loadJobDetails(job.jobUrl);
      if (!details) {
        throw new Error("Couldn't fetch the job description yet.");
      }
      const careersUrl = source.careersUrl;
      const cxsJobsUrl = source.cxsJobsUrl ?? source.careersUrl;
      const draft = buildManualDraftFromWorkdayJob(
        job,
        details,
        careersUrl,
        cxsJobsUrl,
      );
      const draftSource = draft.source ?? null;
      setImportState({
        open: true,
        draft,
        source: draftSource,
        sourceHost:
          getSourceHost(careersUrl) ?? getSourceHost(job.jobUrl) ?? null,
        workdaySource: careersUrl,
        sourceType: source.sourceType,
        catalogSourceId: source.catalogSourceId,
      });
    } catch (error) {
      showErrorToast(error, "Failed to prepare Workday job");
    } finally {
      setMovingJobUrl(null);
    }
  }

  function handleWatchlistSourceMethodSelected(input: {
    method: "catalog" | "custom_url";
    catalogSourceId?: string;
    workdaySource?: string;
  }) {
    trackProductEvent("watchlist_source_add_method_selected", {
      method: input.method,
      ...(input.catalogSourceId
        ? { catalog_source_id: input.catalogSourceId }
        : {}),
      ...(input.workdaySource ? { workday_source: input.workdaySource } : {}),
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
    const selectedSource = items.find((item) => {
      const cxsJobsUrl = item.source.cxsJobsUrl ?? item.source.careersUrl;
      return toWorkdaySource(cxsJobsUrl) === input.source;
    })?.source;

    trackProductEvent("watchlist_job_ignored", {
      source_type: selectedSource?.sourceType ?? "workday",
      ...(selectedSource?.catalogSourceId
        ? { catalog_source_id: selectedSource.catalogSourceId }
        : {}),
      workday_source: selectedSource?.careersUrl ?? input.source,
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
                pipelineSearchTerms={pipelineSearchTerms}
                locationIntent={locationIntent}
                showIgnored={showIgnored}
                setShowIgnored={setShowIgnored}
                getImportedWorkdayJob={getImportedWorkdayJob}
                getWorkdayRowState={getWorkdayRowState}
                getWorkdayStateInput={getWorkdayStateInput}
                jobDetails={jobDetails}
                movingJobUrl={movingJobUrl}
                ignorePending={ignoreMutation.isPending}
                ignoreVariables={ignoreMutation.variables}
                unignorePending={unignoreMutation.isPending}
                unignoreVariables={unignoreMutation.variables}
                watchlistCheckState={watchlistCheckState}
                onIgnore={handleIgnoreWatchlistJob}
                onUnignore={(input) => unignoreMutation.mutate(input)}
                onMoveToWorkspace={(job, source) => {
                  void handleMoveToWorkspace(job, source);
                }}
                onOpenWorkspaceJob={(job) => navigate(getWorkspaceJobPath(job))}
                onLoadJobDetails={(jobUrl) => {
                  void loadJobDetails(jobUrl);
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
            workdaySource: open ? current.workdaySource : null,
            sourceType: open ? current.sourceType : null,
            catalogSourceId: open ? current.catalogSourceId : null,
          }))
        }
        onImported={async (result) => {
          if (importState.workdaySource) {
            trackProductEvent("watchlist_job_moved_to_workspace", {
              source_type: importState.sourceType ?? "workday",
              ...(importState.catalogSourceId
                ? { catalog_source_id: importState.catalogSourceId }
                : {}),
              workday_source: importState.workdaySource,
            });
          }
          await queryClient.invalidateQueries({ queryKey: queryKeys.jobs.all });
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
