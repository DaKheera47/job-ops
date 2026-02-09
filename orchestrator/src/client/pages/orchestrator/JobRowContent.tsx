import type { Job } from "@shared/types.js";
import { cn } from "@/lib/utils";
import { defaultStatusToken, statusTokens } from "./constants";

interface JobRowContentProps {
  job: Job;
  isSelected?: boolean;
  showStatusDot?: boolean;
  statusDotClassName?: string;
  className?: string;
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
        {job.salary?.trim() && (
          <div className="truncate text-xs text-muted-foreground mt-0.5">
            {job.salary}
          </div>
        )}
      </div>

      {hasScore && (
        <div className="shrink-0 text-right">
          <span
            className={cn(
              "text-xs tabular-nums",
              (job.suitabilityScore ?? 0) >= 70
                ? "text-emerald-400/90"
                : (job.suitabilityScore ?? 0) >= 50
                  ? "text-foreground/60"
                  : "text-muted-foreground/60",
            )}
          >
            {job.suitabilityScore}
          </span>
        </div>
      )}
    </div>
  );
};
