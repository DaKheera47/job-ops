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
import type { JobListItem } from "@shared/types.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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

export const WatchlistPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const [items, setItems] = useState<WatchlistFetchState[]>([]);
  const [jobDetails, setJobDetails] = useState<Record<string, JobDetailsState>>(
    {},
  );
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(
    () => new Set(),
  );
  const [importState, setImportState] = useState<WorkdayImportState>({
    open: false,
    draft: null,
    source: null,
    sourceHost: null,
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
      setDismissedUrls(new Set());
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

  const visibleItems = items.filter(
    (item) => !dismissedUrls.has(item.source.id),
  );
  const catalogSources = watchlistSourcesResponse?.catalogSources ?? [];
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

  function dismiss(sourceId: string) {
    setDismissedUrls((current) => {
      const next = new Set(current);
      next.add(sourceId);
      return next;
    });
  }

  function addSourceDraft() {
    setSourceDrafts((current) => [...current, createSourceDraft()]);
  }

  function removeSourceDraft(index: number) {
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

  async function handleSaveSources() {
    const selections = sourceDrafts.map((draft, index) => {
      if (draft.isCustom) {
        const careersUrl = draft.customUrl.trim();
        if (!careersUrl) {
          throw new Error(`Source ${index + 1} is missing a Workday URL.`);
        }

        return {
          catalogSourceId: null,
          sourceType: "workday" as const,
          label: careersUrl,
          careersUrl,
        };
      }

      if (!draft.catalogSourceId) {
        throw new Error(`Source ${index + 1} is not selected.`);
      }

      const catalogSource = catalogSources.find(
        (source) => source.id === draft.catalogSourceId,
      );
      if (!catalogSource) {
        throw new Error(`Source ${index + 1} is no longer available.`);
      }

      return {
        catalogSourceId: catalogSource.id,
        sourceType: catalogSource.sourceType,
        label: catalogSource.label,
        careersUrl: catalogSource.careersUrl,
      };
    });

    const uniqueUrls = new Set(
      selections.map((selection) => selection.careersUrl),
    );
    if (uniqueUrls.size !== selections.length) {
      throw new Error("Choose unique watchlist URLs.");
    }

    await saveSourcesMutation.mutateAsync({ selections });
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
    careersUrl: string,
    cxsJobsUrl: string,
  ) {
    try {
      setMovingJobUrl(job.jobUrl);
      const details = await loadJobDetails(job.jobUrl);
      if (!details) {
        throw new Error("Couldn't fetch the job description yet.");
      }
      const draft = buildManualDraftFromWorkdayJob(
        job,
        details,
        careersUrl,
        cxsJobsUrl,
      );
      const source = draft.source ?? null;
      setImportState({
        open: true,
        draft,
        source,
        sourceHost:
          getSourceHost(careersUrl) ?? getSourceHost(job.jobUrl) ?? null,
      });
    } catch (error) {
      showErrorToast(error, "Failed to prepare Workday job");
    } finally {
      setMovingJobUrl(null);
    }
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
            catalogSources={catalogSources}
            formattedLastCheckedAt={formattedLastCheckedAt}
            formattedPreviousLastCheckedAt={formattedPreviousLastCheckedAt}
            newJobsCount={newJobsCount}
            isSaving={saveSourcesMutation.isPending}
            onAddSource={addSourceDraft}
            onRemoveSource={removeSourceDraft}
            onUpdateDraft={updateDraft}
            onSave={() => {
              void handleSaveSources().catch((error) => {
                showErrorToast(error, "Failed to save watchlist sources");
              });
            }}
          />

          {visibleItems.map((item) => (
            <WatchlistSourceResultsCard
              key={item.source.id}
              item={item}
              pipelineSearchTerms={pipelineSearchTerms}
              locationIntent={locationIntent}
              showIgnored={showIgnored}
              dismiss={dismiss}
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
              onIgnore={(input) => ignoreMutation.mutate(input)}
              onUnignore={(input) => unignoreMutation.mutate(input)}
              onMoveToWorkspace={(job, careersUrl, cxsJobsUrl) => {
                void handleMoveToWorkspace(job, careersUrl, cxsJobsUrl);
              }}
              onOpenWorkspaceJob={(job) => navigate(getWorkspaceJobPath(job))}
              onLoadJobDetails={(jobUrl) => {
                void loadJobDetails(jobUrl);
              }}
            />
          ))}

          {visibleItems.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
              All watchlist responses dismissed.
            </div>
          ) : null}
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
          }))
        }
        onImported={async (result) => {
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
