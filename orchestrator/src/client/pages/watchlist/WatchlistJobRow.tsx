import { JobDescriptionPanel } from "@client/components/JobDescriptionPanel";
import type {
  WatchlistJobResult,
  WatchlistSelectedSource,
  WatchlistWorkspaceJobReference,
} from "@shared/types.js";
import {
  ExternalLinkIcon,
  Eye,
  EyeOff,
  FileText,
  FolderInput,
  Loader2,
  MoreHorizontal,
  RotateCcw,
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
import { TableCell, TableRow } from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { JobDetailsState, RankedWatchlistJob } from "./types";

interface WatchlistJobRowProps {
  rankedJob: RankedWatchlistJob;
  source: WatchlistSelectedSource;
  details?: JobDetailsState;
  movingJobRef: string | null;
  ignorePending: boolean;
  ignoreVariables?: { source: string; sourceJobId: string };
  unignorePending: boolean;
  unignoreVariables?: { source: string; sourceJobId: string };
  onIgnore: (input: { source: string; sourceJobId: string }) => void;
  onUnignore: (input: { source: string; sourceJobId: string }) => void;
  onMoveToWorkspace: (
    job: WatchlistJobResult,
    source: WatchlistSelectedSource,
  ) => void;
  onOpenWorkspaceJob: (job: WatchlistWorkspaceJobReference) => void;
  onLoadJobDetails: (
    job: WatchlistJobResult,
    source: WatchlistSelectedSource,
  ) => void;
}

type WatchlistSignal = {
  label: string;
  dotClassName: string;
};

function formatPostedDate(value: string | null): string {
  if (!value) return "—";

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function WatchlistJobRow({
  rankedJob,
  source,
  details,
  movingJobRef,
  ignorePending,
  ignoreVariables,
  unignorePending,
  unignoreVariables,
  onIgnore,
  onUnignore,
  onMoveToWorkspace,
  onOpenWorkspaceJob,
  onLoadJobDetails,
}: WatchlistJobRowProps) {
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
  const watchlistJob = rankedJob.watchlistJob;
  const stateInput = {
    source: watchlistJob.source,
    sourceJobId: watchlistJob.sourceJobId,
  };
  const isIgnoring =
    ignorePending &&
    ignoreVariables?.source === stateInput.source &&
    ignoreVariables?.sourceJobId === stateInput.sourceJobId;
  const isUnignoring =
    unignorePending &&
    unignoreVariables?.source === stateInput.source &&
    unignoreVariables?.sourceJobId === stateInput.sourceJobId;
  const signals: WatchlistSignal[] = [];

  if (watchlistJob.workspaceJob) {
    signals.push({
      label: "Already in workspace",
      dotClassName: "bg-emerald-400",
    });
  }

  if (rankedJob.rowState === "ignored" && !watchlistJob.workspaceJob) {
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

  if (watchlistJob.isNewSinceLastCheck) {
    signals.push({
      label: "New since last check",
      dotClassName: "bg-sky-400",
    });
  }

  const handleDescriptionOpenChange = (open: boolean) => {
    setIsDescriptionOpen(open);
    if (open) {
      onLoadJobDetails(watchlistJob, source);
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
              <button
                type="button"
                onClick={() => handleDescriptionOpenChange(true)}
                className={cn(buttonVariants({ variant: "link" }), "px-0")}
              >
                {rankedJob.job.title}
              </button>
            </div>
          </div>
        </TableCell>
        <TableCell className="py-2.5">
          <div className="text-sm text-muted-foreground">
            {watchlistJob.employer}
          </div>
        </TableCell>
        <TableCell className="py-2.5">
          <div className="text-sm text-muted-foreground">
            {watchlistJob.location || "Unknown"}
          </div>
        </TableCell>
        <TableCell className="py-2.5">
          <div className="text-sm text-muted-foreground">
            {formatPostedDate(watchlistJob.postedAt)}
          </div>
        </TableCell>

        <TableCell className="px-3 py-2.5">
          <div className="flex items-center justify-end">
            {watchlistJob.workspaceJob ? (
              <>
                <TooltipProvider delayDuration={0}>
                  <Tooltip>
                    <TooltipTrigger>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => {
                          if (watchlistJob.workspaceJob) {
                            onOpenWorkspaceJob(watchlistJob.workspaceJob);
                          }
                        }}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View in JobOps workspace</TooltipContent>
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
                        disabled={movingJobRef === watchlistJob.jobRef}
                        onClick={() => onMoveToWorkspace(watchlistJob, source)}
                      >
                        {movingJobRef === watchlistJob.jobRef ? (
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
                    <DropdownMenuItem asChild>
                      <a
                        href={watchlistJob.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center w-full"
                      >
                        <ExternalLinkIcon className="mr-2 h-4 w-4" />
                        View on careers page
                      </a>
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
                ? details.details.descriptionHtml
                : null
            }
            jobUrl={watchlistJob.jobUrl}
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
