import type React from "react";
import type { JobStatus } from "../../../shared/types";
import { PipelineProgress } from "../../components";

interface OrchestratorSummaryProps {
  stats: Record<JobStatus, number>;
  isPipelineRunning: boolean;
}

export const OrchestratorSummary: React.FC<OrchestratorSummaryProps> = ({
  stats,
  isPipelineRunning,
}) => {
  const totalJobs = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Jobs</h1>
      </div>

      {isPipelineRunning && (
        <div className="max-w-3xl">
          <PipelineProgress isRunning={isPipelineRunning} />
        </div>
      )}

      {/* Compact metrics summary - demoted visual weight */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground/80">
        <span>
          <span className="tabular-nums">{stats.ready}</span> ready
        </span>
        <span className="text-border">•</span>
        <span>
          <span className="tabular-nums">
            {stats.discovered + stats.processing}
          </span>{" "}
          discovered
        </span>
        <span className="text-border">•</span>
        <span>
          <span className="tabular-nums">{stats.applied}</span> applied
        </span>
        <span className="text-border">•</span>
        <span className="font-medium text-foreground/60">
          {totalJobs} jobs total
        </span>
        {(stats.skipped > 0 || stats.expired > 0) && (
          <>
            <span className="text-border">•</span>
            <span className="text-muted-foreground/60">
              <span className="tabular-nums">
                {stats.skipped + stats.expired}
              </span>{" "}
              skipped
            </span>
          </>
        )}
      </div>
    </section>
  );
};
