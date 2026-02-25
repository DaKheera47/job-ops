import type { Job } from "@shared/types.js";
import {
  ArrowUpRight,
  Calendar,
  DollarSign,
  Loader2,
  MapPin,
  Search,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatDate, sourceLabel } from "@/lib/utils";
import { useSettings } from "../hooks/useSettings";
import {
  getJobStatusIndicator,
  getTracerStatusIndicator,
  StatusIndicator,
} from "./StatusIndicator";

interface JobHeaderProps {
  job: Job;
  className?: string;
  onCheckSponsor?: () => Promise<void>;
}

const ScoreMeter: React.FC<{ score: number | null }> = ({ score }) => {
  if (score == null) {
    return <span className="text-[10px] text-muted-foreground/60">-</span>;
  }

  return (
    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
      <div className="h-1 w-12 rounded-full bg-muted/30">
        <div
          className="h-1 rounded-full bg-primary/50"
          style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
        />
      </div>
      <span className="tabular-nums">{score}</span>
    </div>
  );
};

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

export const JobHeader: React.FC<JobHeaderProps> = ({
  job,
  className,
  onCheckSponsor,
}) => {
  const jobStatus = getJobStatusIndicator(job.status);
  const tracerStatus = getTracerStatusIndicator(job.tracerLinksEnabled);
  const { showSponsorInfo } = useSettings();
  const { pathname } = useLocation();
  const isJobPage = pathname.startsWith("/job/");
  const deadline = formatDate(job.deadline);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Detail header: lighter weight than list items */}
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <Link
            to={`/job/${job.id}`}
            className="block text-base font-semibold leading-snug text-foreground/90 underline-offset-2 break-words hover:underline"
          >
            {job.title}
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{job.employer}</span>
          </div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wide text-muted-foreground border-border/50"
          >
            {sourceLabel[job.source]}
          </Badge>
          {job.isRemote === true && (
            <Badge
              variant="outline"
              className="text-[10px] uppercase tracking-wide text-muted-foreground border-border/50"
            >
              Remote
            </Badge>
          )}
          {!isJobPage && (
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px] uppercase tracking-wide"
            >
              <Link to={`/job/${job.id}`}>
                View
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Tertiary metadata - subdued */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground/70">
        {job.location && (
          <span className="flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            {job.location}
          </span>
        )}
        {deadline && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {deadline}
          </span>
        )}
        {job.salary && (
          <span className="flex items-center gap-1">
            <DollarSign className="h-3 w-3" />
            {job.salary}
          </span>
        )}
      </div>

      {/* Status and score: single line, subdued */}
      <div className="flex items-center justify-between gap-2 py-1 border-y border-border/30">
        <div className="flex items-center gap-4">
          <StatusIndicator
            dotColor={jobStatus.dotColor}
            label={jobStatus.label}
          />
          <StatusIndicator
            dotColor={tracerStatus.dotColor}
            label={tracerStatus.label}
          />
          {showSponsorInfo && (
            <SponsorPill
              score={job.sponsorMatchScore}
              names={job.sponsorMatchNames}
              onCheck={onCheckSponsor}
            />
          )}
        </div>
        <ScoreMeter score={job.suitabilityScore} />
      </div>
    </div>
  );
};
