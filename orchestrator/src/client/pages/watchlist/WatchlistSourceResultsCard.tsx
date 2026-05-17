import type { NormalizedWorkdayJob } from "@client/api/workday";
import { JobDescriptionPanel } from "@client/components/JobDescriptionPanel";
import { OpenJobListingButton } from "@client/components/OpenJobListingButton";
import type { LocationIntent } from "@shared/location-intelligence.js";
import type { JobListItem, WatchlistSelectedSource } from "@shared/types.js";
import { EyeOff, FolderInput, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { JobRowContent } from "../orchestrator/JobRowContent";
import type {
  JobDetailsState,
  RankedWorkdayJob,
  WatchlistCheckState,
  WatchlistFetchState,
  WatchlistRowState,
} from "./types";
import { getWorkdayImportKey, rankWorkdayJobs } from "./utils";

interface WatchlistSourceResultsCardProps {
  item: WatchlistFetchState;
  pipelineSearchTerms: string[];
  locationIntent: LocationIntent;
  showIgnored: boolean;
  dismiss: (sourceId: string) => void;
  setShowIgnored: (next: boolean) => void;
  getImportedWorkdayJob: (
    workdayJob: NormalizedWorkdayJob,
    cxsJobsUrl: string,
  ) => JobListItem | undefined;
  getWorkdayRowState: (
    workdayJob: NormalizedWorkdayJob,
    cxsJobsUrl: string,
  ) => WatchlistRowState;
  getWorkdayStateInput: (
    workdayJob: NormalizedWorkdayJob,
    cxsJobsUrl: string,
  ) => { source: string; sourceJobId: string };
  jobDetails: Record<string, JobDetailsState>;
  movingJobUrl: string | null;
  ignorePending: boolean;
  ignoreVariables?: { source: string; sourceJobId: string };
  unignorePending: boolean;
  unignoreVariables?: { source: string; sourceJobId: string };
  watchlistCheckState: WatchlistCheckState;
  onIgnore: (input: { source: string; sourceJobId: string }) => void;
  onUnignore: (input: { source: string; sourceJobId: string }) => void;
  onMoveToWorkspace: (
    job: NormalizedWorkdayJob,
    careersUrl: string,
    cxsJobsUrl: string,
  ) => void;
  onOpenWorkspaceJob: (job: JobListItem) => void;
  onLoadJobDetails: (jobUrl: string) => void;
}

function getStatusBadge(item: WatchlistFetchState) {
  if (item.status === "loading") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Checking
      </span>
    );
  }

  if (item.status === "success") {
    return (
      <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
        Success
      </span>
    );
  }

  return (
    <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
      Error
    </span>
  );
}

export function WatchlistSourceResultsCard({
  item,
  pipelineSearchTerms,
  locationIntent,
  showIgnored,
  dismiss,
  setShowIgnored,
  getImportedWorkdayJob,
  getWorkdayRowState,
  getWorkdayStateInput,
  jobDetails,
  movingJobUrl,
  ignorePending,
  ignoreVariables,
  unignorePending,
  unignoreVariables,
  watchlistCheckState,
  onIgnore,
  onUnignore,
  onMoveToWorkspace,
  onOpenWorkspaceJob,
  onLoadJobDetails,
}: WatchlistSourceResultsCardProps) {
  return (
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
          {getStatusBadge(item)}

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
        <WatchlistSourceJobs
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
          ignorePending={ignorePending}
          ignoreVariables={ignoreVariables}
          unignorePending={unignorePending}
          unignoreVariables={unignoreVariables}
          watchlistCheckState={watchlistCheckState}
          onIgnore={onIgnore}
          onUnignore={onUnignore}
          onMoveToWorkspace={onMoveToWorkspace}
          onOpenWorkspaceJob={onOpenWorkspaceJob}
          onLoadJobDetails={onLoadJobDetails}
        />
      )}
    </div>
  );
}

interface WatchlistSourceJobsProps
  extends Omit<WatchlistSourceResultsCardProps, "dismiss"> {
  item: Extract<WatchlistFetchState, { status: "success" }>;
}

function WatchlistSourceJobs({
  item,
  pipelineSearchTerms,
  locationIntent,
  showIgnored,
  setShowIgnored,
  getImportedWorkdayJob,
  getWorkdayRowState,
  getWorkdayStateInput,
  jobDetails,
  movingJobUrl,
  ignorePending,
  ignoreVariables,
  unignorePending,
  unignoreVariables,
  watchlistCheckState,
  onIgnore,
  onUnignore,
  onMoveToWorkspace,
  onOpenWorkspaceJob,
  onLoadJobDetails,
}: WatchlistSourceJobsProps) {
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
    : rankedJobs.filter((rankedJob) => rankedJob.rowState !== "ignored");

  return (
    <div className="divide-y divide-border/40">
      <div className="flex items-center justify-between gap-3 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        <span>
          {visibleRankedJobs.length} of {item.response.total} jobs
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

      {visibleRankedJobs.map((rankedJob) => (
        <WatchlistJobRow
          key={rankedJob.job.id}
          rankedJob={rankedJob}
          source={item.source}
          getWorkdayStateInput={getWorkdayStateInput}
          details={jobDetails[rankedJob.workdayJob.jobUrl]}
          movingJobUrl={movingJobUrl}
          ignorePending={ignorePending}
          ignoreVariables={ignoreVariables}
          unignorePending={unignorePending}
          unignoreVariables={unignoreVariables}
          watchlistCheckState={watchlistCheckState}
          onIgnore={onIgnore}
          onUnignore={onUnignore}
          onMoveToWorkspace={onMoveToWorkspace}
          onOpenWorkspaceJob={onOpenWorkspaceJob}
          onLoadJobDetails={onLoadJobDetails}
        />
      ))}
    </div>
  );
}

interface RankedWatchlistJobRow extends RankedWorkdayJob {
  importedJob: JobListItem | undefined;
  rowState: WatchlistRowState;
}

interface WatchlistJobRowProps {
  rankedJob: RankedWatchlistJobRow;
  source: WatchlistSelectedSource;
  getWorkdayStateInput: (
    workdayJob: NormalizedWorkdayJob,
    cxsJobsUrl: string,
  ) => { source: string; sourceJobId: string };
  details?: JobDetailsState;
  movingJobUrl: string | null;
  ignorePending: boolean;
  ignoreVariables?: { source: string; sourceJobId: string };
  unignorePending: boolean;
  unignoreVariables?: { source: string; sourceJobId: string };
  watchlistCheckState: WatchlistCheckState;
  onIgnore: (input: { source: string; sourceJobId: string }) => void;
  onUnignore: (input: { source: string; sourceJobId: string }) => void;
  onMoveToWorkspace: (
    job: NormalizedWorkdayJob,
    careersUrl: string,
    cxsJobsUrl: string,
  ) => void;
  onOpenWorkspaceJob: (job: JobListItem) => void;
  onLoadJobDetails: (jobUrl: string) => void;
}

function WatchlistJobRow({
  rankedJob,
  source,
  getWorkdayStateInput,
  details,
  movingJobUrl,
  ignorePending,
  ignoreVariables,
  unignorePending,
  unignoreVariables,
  watchlistCheckState,
  onIgnore,
  onUnignore,
  onMoveToWorkspace,
  onOpenWorkspaceJob,
  onLoadJobDetails,
}: WatchlistJobRowProps) {
  const stateInput = getWorkdayStateInput(
    rankedJob.workdayJob,
    source.cxsJobsUrl ?? source.careersUrl,
  );
  const isIgnoring =
    ignorePending &&
    ignoreVariables?.source === stateInput.source &&
    ignoreVariables?.sourceJobId === stateInput.sourceJobId;
  const isUnignoring =
    unignorePending &&
    unignoreVariables?.source === stateInput.source &&
    unignoreVariables?.sourceJobId === stateInput.sourceJobId;
  const isNewSinceLastCheck =
    rankedJob.rowState === "new" &&
    watchlistCheckState.newJobKeys.has(
      getWorkdayImportKey(stateInput.source, stateInput.sourceJobId),
    );

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <JobRowContent
          job={rankedJob.job}
          showStatusDot={false}
          showSuitabilityScore={false}
          className="min-w-0 flex-1"
        />
        <OpenJobListingButton
          href={rankedJob.workdayJob.jobUrl}
          size="sm"
          className="shrink-0"
        />
        {rankedJob.importedJob ? (
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
              Already in workspace
            </span>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              onClick={() => {
                if (rankedJob.importedJob) {
                  onOpenWorkspaceJob(rankedJob.importedJob);
                }
              }}
            >
              Open workspace job
            </Button>
          </div>
        ) : rankedJob.rowState === "ignored" ? (
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
              onClick={() => onUnignore(stateInput)}
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
              disabled={movingJobUrl === rankedJob.workdayJob.jobUrl}
              onClick={() =>
                onMoveToWorkspace(
                  rankedJob.workdayJob,
                  source.careersUrl,
                  source.cxsJobsUrl ?? source.careersUrl,
                )
              }
            >
              {movingJobUrl === rankedJob.workdayJob.jobUrl ? (
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
              onClick={() => onIgnore(stateInput)}
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
        {rankedJob.matchedSearchTerm ? (
          <span className="shrink-0 rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
            {rankedJob.matchedSearchTerm} · {rankedJob.matchScore}
          </span>
        ) : null}
        {rankedJob.locationMatched ? (
          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300">
            {rankedJob.locationPriority > 0 ? "location" : "remote"}
          </span>
        ) : null}
        {isNewSinceLastCheck ? (
          <span className="shrink-0 rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-xs text-sky-300">
            New since last check
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
        jobUrl={rankedJob.workdayJob.jobUrl}
        defaultOpen={false}
        isLoading={details?.status === "loading"}
        error={details?.status === "error" ? details.error : null}
        onOpen={() => onLoadJobDetails(rankedJob.workdayJob.jobUrl)}
        maxHeightClassName="max-h-72"
        className="mt-3"
      />
    </div>
  );
}
