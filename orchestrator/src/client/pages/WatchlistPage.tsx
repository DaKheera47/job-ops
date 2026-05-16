import {
  fetchWorkdayCxsJobDetails,
  fetchWorkdayCxsJobs,
  type NormalizedWorkdayJob,
  type NormalizedWorkdayJobDetails,
  type WorkdayCxsJobsResult,
} from "@client/api/workday";
import { JobDescriptionPanel } from "@client/components/JobDescriptionPanel";
import { PageHeader, PageMain } from "@client/components/layout";
import { OpenJobListingButton } from "@client/components/OpenJobListingButton";
import type { JobListItem } from "@shared/types.js";
import { Eye, Loader2, X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
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

export const WatchlistPage: React.FC = () => {
  const [items, setItems] = useState<WatchlistFetchState[]>([]);
  const [jobDetails, setJobDetails] = useState<Record<string, JobDetailsState>>(
    {},
  );
  const [dismissedUrls, setDismissedUrls] = useState<Set<string>>(
    () => new Set(),
  );

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

  function dismiss(careersUrl: string) {
    setDismissedUrls((current) => {
      const next = new Set(current);
      next.add(careersUrl);
      return next;
    });
  }

  async function loadJobDetails(jobUrl: string) {
    if (jobDetails[jobUrl]) return;

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
    } catch (error) {
      setJobDetails((current) => ({
        ...current,
        [jobUrl]: {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      }));
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

                  {item.response.jobs.map((workdayJob) => {
                    const job = toJobListItem(workdayJob, item.careersUrl);
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
                          onOpen={() => void loadJobDetails(workdayJob.jobUrl)}
                          maxHeightClassName="max-h-72"
                          className="mt-3"
                        />
                      </div>
                    );
                  })}
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
    </>
  );
};
