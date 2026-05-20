import type { NormalizedWorkdayJob } from "@client/api/workday";
import type { LocationIntent } from "@shared/location-intelligence.js";
import type { JobListItem, WatchlistSelectedSource } from "@shared/types.js";
import { CircleAlert, Loader2 } from "lucide-react";
import { formatUserFacingError } from "@/client/lib/error-format";
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type {
  JobDetailsState,
  WatchlistCheckState,
  WatchlistFetchState,
  WatchlistRowState,
} from "./types";
import { rankWorkdayJobs } from "./utils";
import WatchlistJobRow from "./WatchlistJobRow";

interface WatchlistSourceResultsCardProps {
  item: WatchlistFetchState;
  pipelineSearchTerms: string[];
  locationIntent: LocationIntent;
  showIgnored: boolean;
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
    source: WatchlistSelectedSource,
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

  if (item.status === "success") return null;

  return (
    <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-1 text-xs text-destructive">
      Error
    </span>
  );
}

function formatWatchlistErrorDiagnostics(error: unknown): string {
  if (typeof error === "string") return error;

  try {
    return JSON.stringify(error, null, 2);
  } catch {
    return String(error);
  }
}

export function WatchlistSourceResultsCard({
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
}: WatchlistSourceResultsCardProps) {
  return (
    <AccordionItem value={item.source.id} className="border-0">
      <AccordionTrigger className="flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex items-center justify-start gap-x-4">
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
          </div>
        </div>
      </AccordionTrigger>

      <AccordionContent key={item.source.id}>
        {item.status === "loading" ? (
          <div className="flex items-center gap-2 bg-muted/30 p-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Fetching from Workday...
          </div>
        ) : item.status === "error" ? (
          <div className="p-4">
            <Alert variant="destructive">
              <CircleAlert className="h-4 w-4" />
              <AlertTitle>Couldn&apos;t load jobs</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>
                  {formatUserFacingError(
                    item.error,
                    "Couldn’t fetch jobs from this careers page.",
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  This source failed to load, but the rest of your watchlist can
                  still be checked.
                </p>
                <details className="rounded-md border border-destructive/20 bg-background/60 p-3 text-xs text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">
                    Technical details
                  </summary>
                  <pre className="mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {JSON.stringify(
                      {
                        label: item.source.label,
                        sourceType: item.source.sourceType,
                        careersUrl: item.source.careersUrl,
                        cxsJobsUrl: item.source.cxsJobsUrl,
                        error: formatWatchlistErrorDiagnostics(item.error),
                      },
                      null,
                      2,
                    )}
                  </pre>
                </details>
              </AlertDescription>
            </Alert>
          </div>
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
      </AccordionContent>
    </AccordionItem>
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
