import React, { useMemo, useState } from "react";
import { Calendar, DollarSign, Loader2, MapPin, Search, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatDate, sourceLabel } from "@/lib/utils";
import type { Job, JobStatus } from "../../shared/types";
import { defaultStatusToken, statusTokens } from "../pages/orchestrator/constants";

interface JobHeaderProps {
  job: Job;
  className?: string;
  showSponsorInfo?: boolean;
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

interface SponsorBadgeProps {
  score: number | null;
  names: string | null;
  onCheck?: () => Promise<void>;
}

const SponsorBadge: React.FC<SponsorBadgeProps> = ({ score, names, onCheck }) => {
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-5 px-1.5 text-[9px] font-medium text-muted-foreground hover:text-foreground"
              onClick={handleCheck}
              disabled={isChecking}
            >
              {isChecking ? (
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
              ) : (
                <Search className="h-2.5 w-2.5" />
              )}
              <span className="ml-0.5">{isChecking ? "Checking..." : "Check Visa"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">Check if employer is a visa sponsor</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // If no score (and no callback), show nothing
  if (score == null || score < 50) {
    return null;
  }

  // Color tokens based on score
  const getScoreTokens = (s: number) => {
    if (s >= 90) return {
      badge: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
      label: "Visa Sponsor"
    };
    if (s >= 70) return {
      badge: "border-amber-500/40 bg-amber-500/15 text-amber-300",
      label: "Likely Sponsor"
    };
    return {
      badge: "border-orange-500/40 bg-orange-500/15 text-orange-300",
      label: "Possible Sponsor"
    };
  };

  const tokens = getScoreTokens(score);
  const tooltipContent = parsedNames.length > 0
    ? `${score}% match: ${parsedNames.join(", ")}`
    : `${score}% match with visa sponsor list`;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide cursor-help",
              tokens.badge
            )}
          >
            <Shield className="h-2.5 w-2.5" />
            {score}%
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          <p className="text-xs">{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export const JobHeader: React.FC<JobHeaderProps> = ({ job, className, showSponsorInfo = true, onCheckSponsor }) => {
  const deadline = formatDate(job.deadline);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Detail header: lighter weight than list items */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-foreground/90">{job.title}</div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{job.employer}</span>
            {showSponsorInfo && (
              <SponsorBadge
                score={job.sponsorMatchScore}
                names={job.sponsorMatchNames}
                onCheck={onCheckSponsor}
              />
            )}
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wide text-muted-foreground border-border/50">
          {sourceLabel[job.source]}
        </Badge>
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
        <StatusPill status={job.status} />
        <ScoreMeter score={job.suitabilityScore} />
      </div>
    </div>
  );
};
