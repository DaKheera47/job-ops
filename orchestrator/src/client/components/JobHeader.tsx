import React from "react";
import { Calendar, DollarSign, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate, sourceLabel } from "@/lib/utils";
import type { Job, JobStatus } from "../../shared/types";
import { defaultStatusToken, statusTokens } from "../pages/orchestrator/constants";

interface JobHeaderProps {
  job: Job;
  className?: string;
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

export const JobHeader: React.FC<JobHeaderProps> = ({ job, className }) => {
  const deadline = formatDate(job.deadline);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Detail header: lighter weight than list items */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold text-foreground/90">{job.title}</div>
          <div className="text-xs text-muted-foreground">{job.employer}</div>
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
