import type { Job } from "@shared/types.js";
import { Loader2 } from "lucide-react";
import type React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { FilterTab } from "./constants";
import { defaultStatusToken, emptyStateCopy, statusTokens } from "./constants";

interface JobListPanelProps {
  isLoading: boolean;
  jobs: Job[];
  activeJobs: Job[];
  selectedJobId: string | null;
  selectedJobIds: Set<string>;
  activeTab: FilterTab;
  searchQuery: string;
  onSelectJob: (jobId: string) => void;
  onToggleSelectJob: (jobId: string) => void;
  onToggleSelectAll: (checked: boolean) => void;
}

export const JobListPanel: React.FC<JobListPanelProps> = ({
  isLoading,
  jobs,
  activeJobs,
  selectedJobId,
  selectedJobIds,
  activeTab,
  searchQuery,
  onSelectJob,
  onToggleSelectJob,
  onToggleSelectAll,
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
        <div className="flex items-center justify-between gap-3 px-4 py-2 opacity-50 hover:opacity-100 transition-opacity">
          <label
            htmlFor="job-list-select-all"
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Checkbox
              id="job-list-select-all"
              checked={
                activeJobs.length > 0 &&
                activeJobs.every((job) => selectedJobIds.has(job.id))
              }
              onCheckedChange={() => {
                const allSelected =
                  activeJobs.length > 0 &&
                  activeJobs.every((job) => selectedJobIds.has(job.id));
                onToggleSelectAll(!allSelected);
              }}
              aria-label="Select all filtered jobs"
            />
            Select all filtered
          </label>
          <span className="text-xs text-muted-foreground tabular-nums">
            {selectedJobIds.size} selected
          </span>
        </div>
        {activeJobs.map((job) => {
          const isSelected = job.id === selectedJobId;
          const isChecked = selectedJobIds.has(job.id);
          const hasScore = job.suitabilityScore != null;
          const statusToken = statusTokens[job.status] ?? defaultStatusToken;
          return (
            <div
              key={job.id}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer border-l-2 border-b",
                isChecked
                  ? "!border-l !border-l-primary !bg-muted/40"
                  : "border-l border-l-border/40",
                isSelected
                  ? "bg-primary/5"
                  : "border-b-border/40 hover:bg-muted/20",
                isChecked && isSelected && "outline-2 outline-primary/30",
              )}
            >
              <Checkbox
                checked={isChecked}
                onCheckedChange={() => onToggleSelectJob(job.id)}
                onClick={(event) => event.stopPropagation()}
                aria-label={`Select ${job.title}`}
                className={cn(
                  "border-border/80 cursor-pointer text-muted-foreground/70 transition-opacity",
                  "data-[state=checked]:border-primary data-[state=checked]:bg-primary/20 data-[state=checked]:text-primary",
                  "data-[state=checked]:shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]",
                  isChecked || isSelected
                    ? "opacity-100"
                    : "opacity-0 pointer-events-none group-hover:pointer-events-auto group-hover:opacity-100",
                )}
              />
              {/* Single status indicator: subtle dot */}
              <span
                className={cn(
                  "h-2 w-2 rounded-full shrink-0",
                  statusToken.dot,
                  !isSelected && "opacity-70",
                )}
                title={statusToken.label}
              />

              <button
                type="button"
                onClick={() => onSelectJob(job.id)}
                data-testid={`select-${job.id}`}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                aria-pressed={isSelected}
              >
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
            </div>
          );
        })}
      </div>
    )}
  </div>
);
