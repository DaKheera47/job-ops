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
import { matchJobLocationIntent } from "@shared/job-matching.js";
import { createLocationIntentFromLegacyInputs } from "@shared/location-intelligence.js";
import { normalizeCountryKey } from "@shared/location-support.js";
import type { JobListItem, ManualJobDraft } from "@shared/types.js";
import { Eye, FolderInput, Loader2, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  normalizeWorkplaceTypes,
  parseCityLocationsSetting,
} from "./orchestrator/automatic-run";
import { computeJobMatchScore } from "./orchestrator/JobCommandBar.utils";
import { JobRowContent } from "./orchestrator/JobRowContent";

type WatchlistFetchState =
  | {
      status: "loading";
      careersUrl: string;
    }
  | {
      status: "success";
      careersUrl: string;
      cxsJobsUrl: string;
      response: WorkdayCxsJobsResult;
    }
  | {
      status: "error";
      careersUrl: string;
      cxsJobsUrl?: string;
      error: string;
    };

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

const WATCHLIST_URLS = [
  "https://autodesk.wd1.myworkdayjobs.com/Ext",
  "https://pg.wd5.myworkdayjobs.com/en-US/1000",
];

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

function toWorkdaySource(company: string): string {
  const slug = company
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `workday:${slug || "unknown"}`;
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
): ManualJobDraft {
  const employer =
    details.company ?? job.company ?? getEmployerFromCareersUrl(careersUrl);

  return {
    source: toWorkdaySource(employer),
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

  useEffect(() => {
    let cancelled = false;

    async function fetchWatchlist() {
      setItems(
        WATCHLIST_URLS.map((careersUrl) => ({
          status: "loading",
          careersUrl,
        })),
      );

      await Promise.all(
        WATCHLIST_URLS.map(async (careersUrl) => {
          try {
            const result = await fetchWorkdayCxsJobs(careersUrl, 40);

            if (cancelled) return;

            setItems((current) =>
              current.map((item) =>
                item.careersUrl === careersUrl
                  ? { status: "success", ...result }
                  : item,
              ),
            );
          } catch (error) {
            if (cancelled) return;

            setItems((current) =>
              current.map((item) =>
                item.careersUrl === careersUrl
                  ? {
                      status: "error",
                      careersUrl,
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

    void fetchWatchlist();

    return () => {
      cancelled = true;
    };
  }, []);

  const visibleItems = items.filter(
    (item) => !dismissedUrls.has(item.careersUrl),
  );
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

  function dismiss(careersUrl: string) {
    setDismissedUrls((current) => {
      const next = new Set(current);
      next.add(careersUrl);
      return next;
    });
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
  ) {
    try {
      setMovingJobUrl(job.jobUrl);
      const details = await loadJobDetails(job.jobUrl);
      if (!details) {
        throw new Error("Couldn't fetch the job description yet.");
      }
      const draft = buildManualDraftFromWorkdayJob(job, details, careersUrl);
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
          {visibleItems.map((item) => (
            <div
              key={item.careersUrl}
              className="overflow-hidden rounded-lg border bg-card"
            >
              <div className="flex items-start justify-between gap-4 border-b px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {item.careersUrl}
                  </div>

                  {"cxsJobsUrl" in item && item.cxsJobsUrl ? (
                    <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                      {item.cxsJobsUrl}
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
                    onClick={() => dismiss(item.careersUrl)}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={`Dismiss ${item.careersUrl}`}
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
                      careersUrl: item.careersUrl,
                      cxsJobsUrl: item.cxsJobsUrl,
                      error: item.error,
                    },
                    null,
                    2,
                  )}
                </pre>
              ) : (
                <div className="divide-y divide-border/40">
                  <div className="flex items-center justify-between gap-3 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
                    <span>
                      {item.response.fetched} of {item.response.total} jobs
                    </span>
                  </div>

                  {rankWorkdayJobs(
                    item.response.jobs,
                    item.careersUrl,
                    pipelineSearchTerms,
                    locationIntent,
                  ).map(
                    ({
                      workdayJob,
                      job,
                      matchScore,
                      matchedSearchTerm,
                      locationMatched,
                      locationPriority,
                    }) => {
                      const details = jobDetails[workdayJob.jobUrl];

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
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="shrink-0 gap-2"
                              disabled={movingJobUrl === workdayJob.jobUrl}
                              onClick={() =>
                                void handleMoveToWorkspace(
                                  workdayJob,
                                  item.careersUrl,
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
                            {matchedSearchTerm ? (
                              <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
                                {matchedSearchTerm} · {matchScore}
                              </span>
                            ) : null}
                            {locationMatched ? (
                              <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
                                {locationPriority > 0 ? "location" : "remote"}
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
                              details?.status === "error" ? details.error : null
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
        onImported={(result) => {
          navigate(`/jobs/ready/${result.jobId}`);
        }}
        initialDraft={importState.draft}
        initialSource={importState.source}
        initialSourceHost={importState.sourceHost}
      />
    </>
  );
};
