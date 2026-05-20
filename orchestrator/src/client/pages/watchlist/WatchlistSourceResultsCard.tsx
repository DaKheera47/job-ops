import type { NormalizedWorkdayJob } from "@client/api/workday";
import { JobDescriptionPanel } from "@client/components/JobDescriptionPanel";
import type { LocationIntent } from "@shared/location-intelligence.js";
import type { JobListItem, WatchlistSelectedSource } from "@shared/types.js";
import {
  ExternalLinkIcon,
  EyeOff,
  FileText,
  FolderInput,
  Loader2,
  MoreHorizontal,
  RotateCcw,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type {
  JobDetailsState,
  RankedWorkdayJob,
  WatchlistCheckState,
  WatchlistFetchState,
  WatchlistRowState,
} from "./types";
import { getWorkdayImportKey, rankWorkdayJobs } from "./utils";
import { formatCustomSourceLabel } from "./WatchlistSourcesCard";

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

function formatPostedDate(value: string | undefined): string {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
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

  if (item.status === "success") return null;

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
          <a
            href={item.source.careersUrl}
            rel="noreferrer"
            target="_blank"
            className={cn(
              buttonVariants({
                size: "sm",
                variant: "link",
              }),
              "px-0",
            )}
          >
            {item.source.label} Careers Page
          </a>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {getStatusBadge(item)}

          <button
            type="button"
            onClick={() => dismiss(item.source.id)}
            className={buttonVariants({
              variant: "ghost",
              size: "icon",
            })}
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
    <div className="space-y-0">
      <div className="flex items-center justify-between gap-3 bg-muted/20 px-4 py-2 text-xs text-muted-foreground">
        <span>
          {visibleRankedJobs.length} jobs
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

      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-9 px-3 text-xs">Job</TableHead>
            <TableHead className="h-9 w-[180px] text-xs">Company</TableHead>
            <TableHead className="h-9 w-[220px] text-xs">Location</TableHead>
            <TableHead className="h-9 w-[140px] text-xs">Posted</TableHead>
            <TableHead className="h-9 px-3 text-xs text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
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
        </TableBody>
      </Table>
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

type WatchlistSignal = {
  label: string;
  dotClassName: string;
};

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
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
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
  const signals: WatchlistSignal[] = [];

  if (rankedJob.importedJob) {
    signals.push({
      label: "Already in workspace",
      dotClassName: "bg-emerald-400",
    });
  }

  if (rankedJob.rowState === "ignored" && !rankedJob.importedJob) {
    signals.push({
      label: "Ignored",
      dotClassName: "bg-muted-foreground/70",
    });
  }

  if (rankedJob.matchedSearchTerm) {
    signals.push({
      label: `${rankedJob.matchedSearchTerm} search match (${rankedJob.matchScore})`,
      dotClassName: "bg-primary",
    });
  }

  if (rankedJob.locationMatched) {
    signals.push({
      label: rankedJob.locationPriority > 0 ? "Location match" : "Remote match",
      dotClassName: "bg-emerald-400",
    });
  }

  if (isNewSinceLastCheck) {
    signals.push({
      label: "New since last check",
      dotClassName: "bg-sky-400",
    });
  }

  const handleDescriptionOpenChange = (open: boolean) => {
    setIsDescriptionOpen(open);
    if (open) {
      onLoadJobDetails(rankedJob.workdayJob.jobUrl);
    }
  };

  return (
    <>
      <TableRow className="group/row align-top even:bg-muted/20 odd:bg-muted/0">
        <TableCell className="px-3 py-2.5">
          <div className="min-w-[16rem]">
            <div className="flex items-center gap-2">
              {signals.length > 0 ? (
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`View signals for ${rankedJob.job.title}`}
                        className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        {signals.map((signal) => (
                          <span
                            key={signal.label}
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full ${signal.dotClassName}`}
                          />
                        ))}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-64 text-xs">
                      <div className="space-y-1">
                        {signals.map((signal) => (
                          <div key={signal.label}>{signal.label}</div>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : null}
              <a
                href={rankedJob.workdayJob.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: "link" }), "px-0")}
              >
                {rankedJob.job.title}

                <ExternalLinkIcon className="size-3 text-muted-foreground" />
              </a>
            </div>
          </div>
        </TableCell>
        {/* company */}
        <TableCell className="py-2.5">
          <div className="text-sm text-muted-foreground">
            {formatCustomSourceLabel(rankedJob.job.jobUrl)}
          </div>
        </TableCell>
        {/* location */}
        <TableCell className="py-2.5">
          <div className="text-sm text-muted-foreground">
            {rankedJob.job.location ||
              rankedJob.workdayJob.locationText ||
              "Unknown"}
          </div>
        </TableCell>
        <TableCell className="py-2.5">
          <div className="text-sm text-muted-foreground">
            {formatPostedDate(rankedJob.workdayJob.postedOn)}
          </div>
        </TableCell>

        <TableCell className="px-3 py-2.5">
          <div className="flex items-center justify-end">
            {rankedJob.importedJob ? (
              <>
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
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleDescriptionOpenChange(true)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Job description
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : rankedJob.rowState === "ignored" ? (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground"
                    aria-label="More actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => handleDescriptionOpenChange(true)}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Job description
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={isUnignoring}
                    onClick={() => onUnignore(stateInput)}
                  >
                    {isUnignoring ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="mr-2 h-4 w-4" />
                    )}
                    Unignore
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        type="button"
                        variant="ghost"
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
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Move to JobOps workspace</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground"
                      aria-label="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => handleDescriptionOpenChange(true)}
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Job description
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={isIgnoring}
                      onClick={() => onIgnore(stateInput)}
                    >
                      {isIgnoring ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <EyeOff className="mr-2 h-4 w-4" />
                      )}
                      Ignore
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </TableCell>
      </TableRow>
      <Dialog
        open={isDescriptionOpen}
        onOpenChange={handleDescriptionOpenChange}
      >
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-hidden p-0">
          <DialogTitle className="sr-only">
            {rankedJob.job.title} job description
          </DialogTitle>
          <JobDescriptionPanel
            description={
              details?.status === "success"
                ? details.details.jobDescriptionText
                : null
            }
            helperText="Fetched only when this panel is opened."
            jobUrl={rankedJob.workdayJob.jobUrl}
            collapsible={false}
            isLoading={details?.status === "loading"}
            error={details?.status === "error" ? details.error : null}
            maxHeightClassName="max-h-[calc(85vh-5rem)]"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
