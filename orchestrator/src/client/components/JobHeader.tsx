import { isAwaitingAiScore, ScoreRing } from "@client/components";
import type { AppliedDuplicateMatch, Job } from "@shared/types.js";
import { Calendar, DollarSign, Loader2, MapPin, Search } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatDate, formatJobSourceLabel, sourceLabel } from "@/lib/utils";
import { useSettings } from "../hooks/useSettings";
import { formatPostingAgeLabel } from "../lib/job-posting-age";
import { appliedDuplicateIndicator } from "../pages/orchestrator/constants";
import {
  getJobStatusIndicator,
  getTracerStatusIndicator,
  StatusIndicator,
} from "./StatusIndicator";

interface JobHeaderProps {
  job: Job;
  className?: string;
  onCheckSponsor?: () => Promise<void>;
  jobCTA?: React.ReactNode;
}

interface SponsorPillProps {
  score: number | null;
  names: string | null;
  onCheck?: () => Promise<void>;
}

const SponsorPill: React.FC<SponsorPillProps> = ({ score, names, onCheck }) => {
  const [isChecking, setIsChecking] = useState(false);

  const parsedNames = useMemo(() => {
    if (!names) return [];
    try {
      return JSON.parse(names) as string[];
    } catch {
      return [];
    }
  }, [names]);

  const handleCheck = async () => {
    if (!onCheck) return;
    setIsChecking(true);
    try {
      await onCheck();
    } finally {
      setIsChecking(false);
    }
  };

  // Show "Check" button if no score and callback provided
  if (score == null && onCheck) {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-xs font-medium text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              onClick={handleCheck}
              disabled={isChecking}
            >
              {isChecking ? (
                <Loader2 className="h-2 w-2 animate-spin" />
              ) : (
                <Search className="h-2 w-2" />
              )}
              <span>
                {isChecking ? "Checking..." : "Check Sponsorship Status"}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Check if employer is a visa sponsor</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (score == null) {
    return null;
  }

  const getStatus = (s: number) => {
    if (s >= 95)
      return {
        label: "Confirmed Sponsor",
        dot: "bg-emerald-500",
        color: "text-emerald-400",
      };
    if (s >= 80)
      return {
        label: "Potential Sponsor",
        dot: "bg-amber-500",
        color: "text-amber-400",
      };
    return {
      label: "Sponsor Not Found",
      dot: "bg-slate-500",
      color: "text-slate-400",
    };
  };

  const status = getStatus(score);
  const tooltip = (
    <>
      {parsedNames.length > 0 && (
        <p className="text-xs font-medium space-x-1">
          <span className="opacity-70">Matched</span>
          <span>{parsedNames.join(", ")}</span>
        </p>
      )}
      <p className="opacity-80 mt-1 text-[10px]">{`${score}% match`}</p>
    </>
  );

  return (
    <StatusIndicator
      dotColor={status.dot}
      label={status.label}
      className="cursor-help"
      tooltip={tooltip}
      tooltipClassName="max-w-xs"
    />
  );
};

const AppliedDuplicatePill: React.FC<{
  match: AppliedDuplicateMatch | null | undefined;
}> = ({ match }) => {
  if (!match) {
    return null;
  }

  const appliedDate = formatDate(match.appliedAt) ?? "Unknown date";
  const tooltip = (
    <div className="space-y-1">
      <p className="text-xs font-medium">{match.title}</p>
      <p className="text-xs opacity-80">{match.employer}</p>
      <p className="text-[10px] opacity-80">
        Applied {appliedDate} · {match.score}% match
      </p>
    </div>
  );

  return (
    <StatusIndicator
      dotColor={appliedDuplicateIndicator.dot}
      label={appliedDuplicateIndicator.label}
      className="cursor-help"
      tooltip={tooltip}
      tooltipClassName="max-w-xs"
    />
  );
};

const postingAgeDotColor = {
  fresh: "bg-emerald-500",
  aging: "bg-amber-500",
  old: "bg-slate-500",
};

export const JobHeader: React.FC<JobHeaderProps> = ({
  job,
  className,
  onCheckSponsor,
  jobCTA,
}) => {
  const jobStatus = getJobStatusIndicator(job.status);
  const tracerStatus = getTracerStatusIndicator(job.tracerLinksEnabled);
  const { showSponsorInfo } = useSettings();
  const location = useLocation();
  const { pathname } = location;
  const isJobPage = pathname.startsWith("/job/");
  const jobPageLinkState = isJobPage
    ? undefined
    : { jobPageBackTo: `${location.pathname}${location.search}` };
  const deadline = formatDate(job.deadline);
  const postingAge = formatPostingAgeLabel(job.datePosted);
  const jobStatusTooltip =
    job.status === "discovered" ? (
      <p className="text-xs">Found by the pipeline. Not tailored yet.</p>
    ) : job.status === "ready" ? (
      <p className="text-xs">Tailored and ready to apply.</p>
    ) : undefined;
  const tracerStatusTooltip = !job.tracerLinksEnabled ? (
    <p className="text-xs">
      Tracer links are turned off for this job, so click tracking will not be
      recorded.
    </p>
  ) : undefined;
  return (
    <div
      className={cn(
        "space-y-3 p-4 bg-muted/30 rounded-lg rounded-b-none border border-b-0 border-border",
        className,
      )}
    >
      {/* Detail header: lighter weight than list items */}
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <Link
            to={`/job/${job.id}`}
            state={jobPageLinkState}
            className="block text-xl font-bold underline-offset-2 break-words hover:underline"
          >
            {job.title}
          </Link>

          <span>{job.employer}</span>

          <div className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground/70 mt-1">
            {(job.location || job.isRemote) && (
              <span className="flex items-center gap-1">
                <MapPin className="size-4" />
                {job.location?.trim()}
                {job.isRemote && ", Remote"}
              </span>
            )}
            {deadline && (
              <span className="flex items-center gap-1">
                <Calendar className="size-4" />
                {deadline}
              </span>
            )}
            {job.salary && (
              <span className="flex items-center gap-1">
                <DollarSign className="size-4" />
                {job.salary}
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full flex-row-reverse sm:flex-col justify-between items-end gap-4 sm:w-auto sm:justify-end h-full">
          <ScoreRing
            score={job.suitabilityScore}
            size="sm"
            isAwaitingAi={isAwaitingAiScore(job)}
            suitabilityReason={job.suitabilityReason}
            jobId={job.id}
          />
          {jobCTA && <>{jobCTA}</>}
        </div>
      </div>

      {/* Status and score: single line, subdued */}
      <div className="flex items-center justify-between gap-2 py-1 border-y border-border/30 flex-wrap">
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
          <StatusIndicator
            dotColor={jobStatus.dotColor}
            label={jobStatus.label}
            tooltip={jobStatusTooltip}
            tooltipClassName="max-w-xs"
            className={jobStatusTooltip ? "cursor-help" : undefined}
          />
          <StatusIndicator
            dotColor={tracerStatus.dotColor}
            label={tracerStatus.label}
            tooltip={tracerStatusTooltip}
            tooltipClassName="max-w-xs"
            className={tracerStatusTooltip ? "cursor-help" : undefined}
          />

          <AppliedDuplicatePill match={job.appliedDuplicateMatch} />

          {job.source && (
            <StatusIndicator
              variant="sky"
              tooltip={`Job found on ${formatJobSourceLabel(job.source)}`}
              label={
                sourceLabel[job.source] ?? formatJobSourceLabel(job.source)
              }
            />
          )}

          {postingAge && (
            <StatusIndicator
              dotColor={postingAgeDotColor[postingAge.tone]}
              label={postingAge.inlineLabel}
              tooltip={postingAge.tooltip}
              tooltipClassName="max-w-xs"
              className="cursor-help"
            />
          )}

          {job.isRemote === true && (
            <StatusIndicator
              variant="emerald"
              label="Remote"
              dotColor="bg-emerald-400"
              tooltip="The job claims to be remote"
            />
          )}

          {showSponsorInfo && (
            <SponsorPill
              score={job.sponsorMatchScore}
              names={job.sponsorMatchNames}
              onCheck={onCheckSponsor}
            />
          )}
        </div>
      </div>
    </div>
  );
};
