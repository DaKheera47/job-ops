import type { Job } from "@shared/types.js";
import { Loader2 } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import type { FilterTab } from "./constants";
import { defaultStatusToken, emptyStateCopy, statusTokens } from "./constants";

interface JobListPanelProps {
  isLoading: boolean;
  jobs: Job[];
  activeJobs: Job[];
  selectedJobId: string | null;
  activeTab: FilterTab;
  searchQuery: string;
  onSelectJob: (jobId: string) => void;
}

export const JobListPanel: React.FC<JobListPanelProps> = ({
  isLoading,
  jobs,
  activeJobs,
  selectedJobId,
  activeTab,
  searchQuery,
  onSelectJob,
}) => (
  <div className="min-w-0 rounded-xl border border-border bg-card shadow-sm">
    {isLoading && jobs.length === 0 ? (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <div className="text-sm text-muted-foreground">Loading jobs...</div>
      </div>
    ) : activeJobs.length === 0 ? (
      <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
        <div className="text-base font-semibold">No jobs found</div>
        <p className="max-w-md text-sm text-muted-foreground">
          {searchQuery.trim()
            ? `No jobs match "${searchQuery.trim()}".`
            : emptyStateCopy[activeTab]}
        </p>
      </div>
    ) : (
      <div className="divide-y divide-border/40">
        {activeJobs.map((job) => {
          const isSelected = job.id === selectedJobId;
          const hasScore = job.suitabilityScore != null;
          const statusToken = statusTokens[job.status] ?? defaultStatusToken;
          return (
            <button
              key={job.id}
              type="button"
              onClick={() => onSelectJob(job.id)}
              data-testid={`select-${job.id}`}
              className={cn(
                "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                isSelected
                  ? "bg-primary/5 border-l-2 border-l-primary"
                  : "hover:bg-muted/20 border-l-2 border-l-transparent",
              )}
              aria-pressed={isSelected}
            >
              {/* Single status indicator: subtle dot */}
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  statusToken.dot,
                  !isSelected && "opacity-70",
                )}
                title={statusToken.label}
              />

              {/* Primary content: title strongest, company secondary */}
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
                    <span className="before:content-['_in_']">
                      {job.location}
                    </span>
                  )}
                </div>
                {job.salary?.trim() && (
                  <div className="truncate text-xs text-muted-foreground mt-0.5">
                    {job.salary}
                  </div>
                )}
              </div>

              {/* Single triage cue: score only (status shown via dot) */}
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
            </button>
          );
        })}
      </div>
    )}
  </div>
);
