import type { Job } from "@shared/types.js";
import { Loader2 } from "lucide-react";
import type React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { FilterTab } from "./constants";
import { defaultStatusToken, emptyStateCopy, statusTokens } from "./constants";
import { JobRowContent } from "./JobRowContent";

interface JobListPanelProps {
  isLoading: boolean;
  jobs: Job[];
  activeJobs: Job[];
  selectedJobId: string | null;
  selectedJobIds: Set<string>;
  activeTab: FilterTab;
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
          {emptyStateCopy[activeTab]}
        </p>
      </div>
    ) : (
      <div className="divide-y divide-border/40">
        <div className="flex items-center justify-between gap-3 px-4 py-2 opacity-100 transition-opacity sm:opacity-50 sm:hover:opacity-100">
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
          const statusToken = statusTokens[job.status] ?? defaultStatusToken;
          return (
            <div
              key={job.id}
              data-job-id={job.id}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 transition-colors cursor-pointer border-l-2 border-b",
                isChecked
                  ? "!border-l !border-l-primary !bg-muted/40"
                  : "border-l border-l-border/40",
                isSelected
                  ? "bg-primary/15"
                  : "border-b-border/40 hover:bg-muted/20",
                isChecked && isSelected && "outline-2 outline-primary/30",
              )}
            >
              <div className="relative h-4 w-4 shrink-0">
                <span
                  className={cn(
                    "absolute inset-0 m-auto h-2 w-2 rounded-full transition-opacity duration-150 ease-out",
                    statusToken.dot,
                    isChecked || isSelected
                      ? "opacity-0"
                      : "opacity-100 group-hover:opacity-0",
                  )}
                  title={statusToken.label}
                />
                <Checkbox
                  checked={isChecked}
                  onCheckedChange={() => onToggleSelectJob(job.id)}
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`Select ${job.title}`}
                  className={cn(
                    "absolute inset-0 m-0 border-border/80 cursor-pointer text-muted-foreground/70 transition-opacity duration-150 ease-out",
                    "data-[state=checked]:border-primary data-[state=checked]:bg-primary/20 data-[state=checked]:text-primary",
                    "data-[state=checked]:shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]",
                    isChecked || isSelected
                      ? "opacity-100 pointer-events-auto"
                      : "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto",
                  )}
                />
              </div>
              <button
                type="button"
                onClick={() => onSelectJob(job.id)}
                data-testid={`select-${job.id}`}
                className="flex min-w-0 flex-1 cursor-pointer text-left"
                aria-pressed={isSelected}
              >
                <JobRowContent
                  job={job}
                  isSelected={isSelected}
                  showStatusDot={false}
                />
              </button>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
