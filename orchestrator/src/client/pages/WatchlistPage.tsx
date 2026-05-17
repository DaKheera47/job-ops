import * as api from "@client/api";
import {
  fetchWorkdayCxsJobDetails,
  fetchWorkdayCxsJobs,
  type NormalizedWorkdayJob,
  type NormalizedWorkdayJobDetails,
  type WorkdayCxsJobsResult,
} from "@client/api/workday";
import { JobDescriptionPanel } from "@client/components/JobDescriptionPanel";
import { PageHeader, PageMain } from "@client/components/layout";
import { ManualImportSheet } from "@client/components/ManualImportSheet";
import { OpenJobListingButton } from "@client/components/OpenJobListingButton";
import { useSettings } from "@client/hooks/useSettings";
import { showErrorToast } from "@client/lib/error-toast";
import { queryKeys } from "@client/lib/queryKeys";
import { matchJobLocationIntent } from "@shared/job-matching.js";
import { createLocationIntentFromLegacyInputs } from "@shared/location-intelligence.js";
import { normalizeCountryKey } from "@shared/location-support.js";
import type {
  JobListItem,
  ManualJobDraft,
  WatchlistSelectedSource,
} from "@shared/types.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, FolderInput, Loader2, RotateCcw, X } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  normalizeWorkplaceTypes,
  parseCityLocationsSetting,
} from "./orchestrator/automatic-run";
import { computeJobMatchScore } from "./orchestrator/JobCommandBar.utils";
import { JobRowContent } from "./orchestrator/JobRowContent";

type WatchlistFetchState =
  | {
      status: "loading";
      source: WatchlistSelectedSource;
    }
  | {
      status: "success";
      source: WatchlistSelectedSource;
      response: WorkdayCxsJobsResult;
    }
  | {
      status: "error";
      source: WatchlistSelectedSource;
      error: string;
    };

interface SourceSelectionDraft {
  id: string;
  isCustom: boolean;
  catalogSourceId: string | null;
  customUrl: string;
}

type JobDetailsState =
  | {
      status: "loading";
    }
  | {
      status: "success";
      details: NormalizedWorkdayJobDetails;
    }
  | {
      status: "error";
      error: string;
    };

interface RankedWorkdayJob {
  workdayJob: NormalizedWorkdayJob;
  job: JobListItem;
  matchScore: number;
  matchedSearchTerm: string | null;
  locationPriority: 0 | 1;
  locationMatched: boolean;
}

interface WorkdayImportState {
  open: boolean;
  draft: ManualJobDraft | null;
  source: string | null;
  sourceHost: string | null;
}

type WatchlistRowState = "new" | "ignored" | "moved_to_workspace";

const CUSTOM_SOURCE_VALUE = "__custom__";
const WATCHLIST_SOURCE_COUNT_OPTIONS = [0, 1, 2, 3, 4, 5] as const;
let sourceDraftSequence = 0;

function createSourceDraft(
  overrides?: Partial<Omit<SourceSelectionDraft, "id">>,
): SourceSelectionDraft {
  sourceDraftSequence += 1;
  return {
    id: `draft-${sourceDraftSequence}`,
    isCustom: false,
    catalogSourceId: null,
    customUrl: "",
    ...overrides,
  };
}

function getEmployerFromCareersUrl(careersUrl: string): string {
  try {
    const host = new URL(careersUrl).hostname;
    const [tenant] = host.split(".");
    return tenant || host;
  } catch {
    return "Workday";
  }
}

function toJobListItem(
  job: NormalizedWorkdayJob,
  careersUrl: string,
): JobListItem {
  const now = new Date().toISOString();

  return {
    id: `workday:${careersUrl}:${job.externalId}`,
    source: "manual",
    sourceJobId: null,
    title: job.title,
    employer: job.company ?? getEmployerFromCareersUrl(careersUrl),
    jobUrl: job.jobUrl,
    applicationLink: job.jobUrl,
    datePosted: job.postedOn ?? null,
    deadline: null,
    salary: null,
    location: job.locationText ?? null,
    status: "discovered",
    outcome: null,
    closedAt: null,
    suitabilityScore: null,
    sponsorMatchScore: null,
    appliedDuplicateMatch: null,
    jobType: null,
    jobFunction: null,
    pdfRegenerating: false,
    pdfFreshness: "missing",
    salaryMinAmount: null,
    salaryMaxAmount: null,
    salaryCurrency: null,
    discoveredAt: now,
    readyAt: null,
    appliedAt: null,
    updatedAt: now,
  };
}

function getPipelineSearchMatch(
  job: JobListItem,
  searchTerms: string[],
): { score: number; term: string | null } {
  let best = { score: 0, term: null as string | null };

  for (const term of searchTerms) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) continue;

    const score = computeJobMatchScore(job, normalizedTerm);
    if (score > best.score) {
      best = { score, term };
    }
  }

  return best;
}

function normalizeUiCountryKey(value: string): string {
  const normalized = normalizeCountryKey(value);
  if (normalized === "usa/ca") return "united states";
  return normalized;
}

function toSourceSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getWorkdayTenantFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const [tenant] = url.hostname.split(".");
    return tenant || null;
  } catch {
    return null;
  }
}

function toWorkdaySource(value: string): string {
  const slug = toSourceSlug(getWorkdayTenantFromUrl(value) ?? value);
  return `workday:${slug || "unknown"}`;
}

function getWorkdayImportKey(source: string, externalId: string): string {
  return `${source}:${externalId}`;
}

function getWorkspaceJobPath(job: JobListItem): string {
  const tab =
    job.status === "discovered"
      ? "discovered"
      : job.status === "applied" || job.status === "in_progress"
        ? "applied"
        : "ready";
  return `/jobs/${tab}/${job.id}`;
}

function getSourceHost(value: string): string | null {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

function buildManualDraftFromWorkdayJob(
  job: NormalizedWorkdayJob,
  details: NormalizedWorkdayJobDetails,
  careersUrl: string,
  cxsJobsUrl: string,
): ManualJobDraft {
  const employer =
    details.company ?? job.company ?? getEmployerFromCareersUrl(careersUrl);

  return {
    source: toWorkdaySource(cxsJobsUrl || careersUrl || employer),
    sourceJobId: job.externalId,
    title: details.title || job.title,
    employer,
    jobUrl: details.jobUrl || job.jobUrl,
    applicationLink: details.jobUrl || job.jobUrl,
    location: details.locationText ?? job.locationText,
    jobDescription: details.jobDescriptionText,
    jobType: details.timeType,
  };
}

function rankWorkdayJobs(
  jobs: NormalizedWorkdayJob[],
  careersUrl: string,
  searchTerms: string[],
  locationIntent: ReturnType<typeof createLocationIntentFromLegacyInputs>,
): RankedWorkdayJob[] {
  const hasSelectedLocation = Boolean(locationIntent.selectedCountry);

  return jobs
    .map((workdayJob, index) => {
      const job = toJobListItem(workdayJob, careersUrl);
      const match = getPipelineSearchMatch(job, searchTerms);
      const locationMatch = hasSelectedLocation
        ? matchJobLocationIntent(
            {
              location: job.location,
              locationEvidence: null,
              isRemote: /(?:^|\b)remote(?:\b|$)/i.test(job.location ?? ""),
            },
            locationIntent,
          )
        : { matched: false, priority: 0 as const };

      return {
        workdayJob,
        job,
        matchScore: match.score,
        matchedSearchTerm: match.term,
        locationPriority: locationMatch.priority,
        locationMatched: locationMatch.matched,
        index,
      };
    })
    .sort((left, right) => {
      if (left.matchScore !== right.matchScore) {
        return right.matchScore - left.matchScore;
      }
      if (left.locationPriority !== right.locationPriority) {
        return right.locationPriority - left.locationPriority;
      }
      if (left.locationMatched !== right.locationMatched) {
        return left.locationMatched ? -1 : 1;
      }
      return left.index - right.index;
    });
}

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
  const [sourceDrafts, setSourceDrafts] = useState<SourceSelectionDraft[]>([
    createSourceDraft(),
  ]);
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
        return;
      }

      setItems(
        enabledSources.map((source) => ({
          status: "loading",
          source,
        })),
      );

      await Promise.all(
        enabledSources.map(async (source) => {
          try {
            const result = await fetchWorkdayCxsJobs(source.careersUrl, 40);

            if (cancelled) return;

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
      setSourceDrafts([createSourceDraft()]);
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
  const pipelineSearchTerms = settings?.searchTerms.value ?? [];
  const locationIntent = createLocationIntentFromLegacyInputs({
    selectedCountry: normalizeUiCountryKey(
      settings?.jobspyCountryIndeed.value ?? "",
    ),
    cityLocations: parseCityLocationsSetting(settings?.searchCities.value),
    workplaceTypes: normalizeWorkplaceTypes(settings?.workplaceTypes.value),
    searchScope: settings?.locationSearchScope.value,
    matchStrictness: settings?.locationMatchStrictness.value,
  });
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

  function updateSourceCount(nextCount: number) {
    setSourceDrafts((current) => {
      if (nextCount <= current.length) {
        return current.slice(0, nextCount);
      }

      return [
        ...current,
        ...Array.from({ length: nextCount - current.length }, () =>
          createSourceDraft(),
        ),
      ];
    });
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
        sourceHost: source ?? getSourceHost(job.jobUrl),
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
          <div className="rounded-lg border bg-card p-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-1">
                <h2 className="text-sm font-medium text-foreground">
                  Watched sources
                </h2>
                <p className="text-sm text-muted-foreground">
                  Choose catalog sources or add your own Workday URL.
                </p>
              </div>

              <div className="w-full max-w-[180px]">
                <Select
                  value={String(sourceDrafts.length)}
                  onValueChange={(value) => updateSourceCount(Number(value))}
                >
                  <SelectTrigger aria-label="Number of watchlist sources">
                    <SelectValue placeholder="Source count" />
                  </SelectTrigger>
                  <SelectContent>
                    {WATCHLIST_SOURCE_COUNT_OPTIONS.map((count) => (
                      <SelectItem key={`count-${count}`} value={String(count)}>
                        {count} {count === 1 ? "source" : "sources"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {sourceDrafts.length === 0 ? (
                <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  No watchlist sources selected.
                </div>
              ) : null}

              {sourceDrafts.map((draft, index) => (
                <div
                  key={draft.id}
                  className="grid gap-3 rounded-md border border-border/60 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                >
                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Source {index + 1}
                    </div>
                    <Select
                      value={
                        draft.isCustom
                          ? CUSTOM_SOURCE_VALUE
                          : (draft.catalogSourceId ?? undefined)
                      }
                      onValueChange={(value) => {
                        if (value === CUSTOM_SOURCE_VALUE) {
                          updateDraft(index, (current) => ({
                            ...current,
                            isCustom: true,
                            catalogSourceId: null,
                          }));
                          return;
                        }

                        updateDraft(index, (current) => ({
                          ...current,
                          isCustom: false,
                          catalogSourceId: value,
                        }));
                      }}
                    >
                      <SelectTrigger
                        aria-label={`Watchlist source ${index + 1}`}
                      >
                        <SelectValue placeholder="Select a source" />
                      </SelectTrigger>
                      <SelectContent>
                        {catalogSources.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.label}
                          </SelectItem>
                        ))}
                        <SelectItem value={CUSTOM_SOURCE_VALUE}>
                          Choose your own Workday URL
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Workday URL
                    </div>
                    {draft.isCustom ? (
                      <Input
                        value={draft.customUrl}
                        onChange={(event) =>
                          updateDraft(index, (current) => ({
                            ...current,
                            customUrl: event.target.value,
                          }))
                        }
                        placeholder="https://company.wd1.myworkdayjobs.com/..."
                        aria-label={`Custom Workday URL ${index + 1}`}
                      />
                    ) : (
                      <div className="flex h-9 items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                        {catalogSources.find(
                          (source) => source.id === draft.catalogSourceId,
                        )?.careersUrl ?? "Select a source to preview its URL"}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end">
              <Button
                type="button"
                className="gap-2"
                disabled={saveSourcesMutation.isPending}
                onClick={() => {
                  void handleSaveSources().catch((error) => {
                    showErrorToast(error, "Failed to save watchlist sources");
                  });
                }}
              >
                {saveSourcesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Save sources
              </Button>
            </div>
          </div>

          {visibleItems.map((item) => (
            <div
              key={item.source.id}
              className="overflow-hidden rounded-lg border bg-card"
            >
              <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {item.source.label}
                  </div>

                  {item.source.careersUrl ? (
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {item.source.careersUrl}
                    </div>
                  ) : null}

                  {item.source.cxsJobsUrl ? (
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {item.source.cxsJobsUrl}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {item.status === "loading" ? (
                    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Checking
                    </span>
                  ) : null}

                  {item.status === "success" ? (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                      Success
                    </span>
                  ) : null}

                  {item.status === "error" ? (
                    <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
                      Error
                    </span>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => dismiss(item.source.id)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Dismiss ${item.source.label}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {item.status === "loading" ? (
                <div className="flex items-center gap-2 bg-muted/30 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Fetching Workday CXS response...
                </div>
              ) : item.status === "error" ? (
                <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap break-words bg-muted/30 p-4 font-mono text-xs leading-relaxed text-muted-foreground">
                  {JSON.stringify(
                    {
                      label: item.source.label,
                      sourceType: item.source.sourceType,
                      careersUrl: item.source.careersUrl,
                      cxsJobsUrl: item.source.cxsJobsUrl,
                      error: item.error,
                    },
                    null,
                    2,
                  )}
                </pre>
              ) : (
                (() => {
                  const rankedJobs = rankWorkdayJobs(
                    item.response.jobs,
                    item.source.careersUrl,
                    pipelineSearchTerms,
                    locationIntent,
                  ).map((rankedJob) => ({
                    ...rankedJob,
                    importedJob: getImportedWorkdayJob(
                      rankedJob.workdayJob,
                      item.source.cxsJobsUrl ?? item.source.careersUrl,
                    ),
                    rowState: getWorkdayRowState(
                      rankedJob.workdayJob,
                      item.source.cxsJobsUrl ?? item.source.careersUrl,
                    ),
                  }));
                  const hiddenIgnoredCount = rankedJobs.filter(
                    (rankedJob) => rankedJob.rowState === "ignored",
                  ).length;
                  const visibleRankedJobs = showIgnored
                    ? rankedJobs
                    : rankedJobs.filter(
                        (rankedJob) => rankedJob.rowState !== "ignored",
                      );

                  return (
                    <div className="divide-y divide-border/40">
                      <div className="flex items-center justify-between gap-3 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                        <span>
                          {visibleRankedJobs.length} of {item.response.total}{" "}
                          jobs
                          {hiddenIgnoredCount > 0 && !showIgnored
                            ? ` (${hiddenIgnoredCount} ignored hidden)`
                            : null}
                        </span>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={showIgnored}
                            onCheckedChange={setShowIgnored}
                            aria-label="Show ignored watchlist jobs"
                          />
                          Show ignored
                        </div>
                      </div>

                      {visibleRankedJobs.map(
                        ({
                          workdayJob,
                          job,
                          matchScore,
                          matchedSearchTerm,
                          locationMatched,
                          locationPriority,
                          importedJob,
                          rowState,
                        }) => {
                          const details = jobDetails[workdayJob.jobUrl];
                          const stateInput = getWorkdayStateInput(
                            workdayJob,
                            item.source.cxsJobsUrl ?? item.source.careersUrl,
                          );
                          const isIgnoring =
                            ignoreMutation.isPending &&
                            ignoreMutation.variables?.source ===
                              stateInput.source &&
                            ignoreMutation.variables?.sourceJobId ===
                              stateInput.sourceJobId;
                          const isUnignoring =
                            unignoreMutation.isPending &&
                            unignoreMutation.variables?.source ===
                              stateInput.source &&
                            unignoreMutation.variables?.sourceJobId ===
                              stateInput.sourceJobId;

                          return (
                            <div key={job.id} className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <JobRowContent
                                  job={job}
                                  showStatusDot={false}
                                  showSuitabilityScore={false}
                                  className="min-w-0 flex-1"
                                />
                                <OpenJobListingButton
                                  href={workdayJob.jobUrl}
                                  size="sm"
                                  className="shrink-0"
                                />
                                {importedJob ? (
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                                      Already in workspace
                                    </span>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      className="shrink-0"
                                      onClick={() =>
                                        navigate(
                                          getWorkspaceJobPath(importedJob),
                                        )
                                      }
                                    >
                                      Open workspace job
                                    </Button>
                                  </div>
                                ) : rowState === "ignored" ? (
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span className="rounded-full border border-muted-foreground/20 bg-muted/40 px-2 py-1 text-xs text-muted-foreground">
                                      Ignored
                                    </span>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      className="shrink-0 gap-2"
                                      disabled={isUnignoring}
                                      onClick={() =>
                                        unignoreMutation.mutate(stateInput)
                                      }
                                    >
                                      {isUnignoring ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <RotateCcw className="h-4 w-4" />
                                      )}
                                      Unignore
                                    </Button>
                                  </div>
                                ) : (
                                  <>
                                    <Button
                                      type="button"
                                      variant="secondary"
                                      size="sm"
                                      className="shrink-0 gap-2"
                                      disabled={
                                        movingJobUrl === workdayJob.jobUrl
                                      }
                                      onClick={() =>
                                        void handleMoveToWorkspace(
                                          workdayJob,
                                          item.source.careersUrl,
                                          item.source.cxsJobsUrl ??
                                            item.source.careersUrl,
                                        )
                                      }
                                    >
                                      {movingJobUrl === workdayJob.jobUrl ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <FolderInput className="h-4 w-4" />
                                      )}
                                      Move to workspace
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="shrink-0 gap-2 text-muted-foreground"
                                      disabled={isIgnoring}
                                      onClick={() =>
                                        ignoreMutation.mutate(stateInput)
                                      }
                                    >
                                      {isIgnoring ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <EyeOff className="h-4 w-4" />
                                      )}
                                      Ignore
                                    </Button>
                                  </>
                                )}
                                {matchedSearchTerm ? (
                                  <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
                                    {matchedSearchTerm} · {matchScore}
                                  </span>
                                ) : null}
                                {locationMatched ? (
                                  <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                                    {locationPriority > 0
                                      ? "location"
                                      : "remote"}
                                  </span>
                                ) : null}
                              </div>

                              <JobDescriptionPanel
                                description={
                                  details?.status === "success"
                                    ? details.details.jobDescriptionText
                                    : null
                                }
                                helperText="Fetched only when this panel is opened."
                                jobUrl={workdayJob.jobUrl}
                                defaultOpen={false}
                                isLoading={details?.status === "loading"}
                                error={
                                  details?.status === "error"
                                    ? details.error
                                    : null
                                }
                                onOpen={() =>
                                  void loadJobDetails(workdayJob.jobUrl)
                                }
                                maxHeightClassName="max-h-72"
                                className="mt-3"
                              />
                            </div>
                          );
                        },
                      )}
                    </div>
                  );
                })()
              )}
            </div>
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
