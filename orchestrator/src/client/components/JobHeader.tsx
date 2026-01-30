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
import type { Job, JobStatus } from "../../shared/types";
import { useSettings } from "../hooks/useSettings";
import {
  defaultStatusToken,
  statusTokens,
} from "../pages/orchestrator/constants";

interface JobHeaderProps {
  job: Job;
  className?: string;
  onCheckSponsor?: () => Promise<void>;
}

const StatusPill: React.FC<{ status: JobStatus }> = ({ status }) => {
  const tokens = statusTokens[status] ?? defaultStatusToken;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full opacity-80", tokens.dot)} />
      {tokens.label}
    </span>
  );
};

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
  const tooltipContent = `${score}% match`;

  return (
    <TooltipProvider>
      <Tooltip delayDuration={0}>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80 cursor-help">
            <span
              className={cn("h-1.5 w-1.5 rounded-full opacity-80", status.dot)}
            />
            {status.label}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {parsedNames.length > 0 && (
            <p className="text-xs font-medium space-x-1">
              <span className="opacity-70">Matched</span>
              <span>{parsedNames.join(", ")}</span>
            </p>
          )}
          <p className="opacity-80 mt-1 text-[10px]">{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const JobHeader: React.FC<JobHeaderProps> = ({
  job,
  className,
  onCheckSponsor,
}) => {
  const { showSponsorInfo } = useSettings();
  const { pathname } = useLocation();
  const isJobPage = pathname.startsWith("/job/");
  const deadline = formatDate(job.deadline);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Detail header: lighter weight than list items */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            to={`/job/${job.id}`}
            className="flex items-center gap-2 text-base font-semibold underline-offset-2 text-foreground/90 hover:underline"
          >
            {job.title}
          </Link>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{job.employer}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
          <StatusPill status={job.status} />
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
