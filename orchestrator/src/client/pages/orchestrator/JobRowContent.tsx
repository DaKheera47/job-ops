import type { JobListItem } from "@shared/types.js";
import { Loader2 } from "lucide-react";
import { isPdfRegenerating, isPdfStale } from "@/client/lib/pdf-freshness";
import { cn } from "@/lib/utils";
import { defaultStatusToken, statusTokens } from "./constants";

interface JobRowContentProps {
  job: JobListItem;
  isSelected?: boolean;
  showStatusDot?: boolean;
  statusDotClassName?: string;
  className?: string;
}

function getSuitabilityScoreTone(score: number): string {
  if (score >= 70) return "text-emerald-400/90";
  if (score >= 50) return "text-foreground/60";
  return "text-muted-foreground/60";
}

export const JobRowContent = ({
  job,
  isSelected = false,
  showStatusDot = true,
  statusDotClassName,
  className,
}: JobRowContentProps) => {
  const hasScore = job.suitabilityScore != null;
  const statusToken = statusTokens[job.status] ?? defaultStatusToken;
  const suitabilityTone = getSuitabilityScoreTone(job.suitabilityScore ?? 0);
  const showStalePdf = isPdfStale(job);
  const showRegeneratingPdf = isPdfRegenerating(job);

  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-3", className)}>
      <span
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          statusToken.dot,
          !isSelected && "opacity-70",
          statusDotClassName,
          !showStatusDot && "hidden",
        )}
        title={statusToken.label}
      />

      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-sm leading-tight",
            isSelected ? "font-semibold" : "font-medium",
          )}
        >
          {job.title}
        </div>
        <div className="truncate text-xs text-muted-foreground mt-0.5">
          {job.employer}
          {job.location && (
            <span className="before:content-['_in_']">{job.location}</span>
          )}
        </div>
        {(job.salary?.trim() || showRegeneratingPdf || showStalePdf) && (
          <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
            {job.salary?.trim() && (
              <span className="truncate text-xs text-muted-foreground">
                {job.salary}
              </span>
            )}
            {showRegeneratingPdf && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-blue-200/70 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-blue-700 dark:border-blue-400/25 dark:bg-blue-400/10 dark:text-blue-200">
                <Loader2 className="h-2.5 w-2.5 animate-spin" />
                Regenerating PDF
              </span>
            )}
            {showStalePdf && (
              <span className="inline-flex shrink-0 rounded-sm border border-amber-200/70 bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
                PDF stale
              </span>
            )}
          </div>
        )}
      </div>

      {hasScore && (
        <div className="shrink-0 text-right">
          <span className={cn("text-xs tabular-nums", suitabilityTone)}>
            {job.suitabilityScore}
          </span>
        </div>
      )}
    </div>
  );
};
