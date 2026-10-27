import { PageHeader, StatusIndicator } from "@client/components/layout";
import type { JobSource } from "@shared/types.js";
import { FileText, Gauge, Loader2, Search, Square, X } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";

interface OrchestratorHeaderProps {
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
  isPipelineRunning: boolean;
  isCancelling: boolean;
  pipelineSources: JobSource[];
  hideRunAction?: boolean;
  isSearchComposerOpen?: boolean;
  onOpenAutomaticRun: () => void;
  onCancelPipeline: () => void;
  onOpenManualImport: () => void;
  unscoredCount?: number;
  isScoringUnscored?: boolean;
  onScoreUnscored?: () => void;
}

export const OrchestratorHeader: React.FC<OrchestratorHeaderProps> = ({
  navOpen,
  onNavOpenChange,
  isPipelineRunning,
  isCancelling,
  pipelineSources,
  hideRunAction = false,
  isSearchComposerOpen = false,
  onOpenAutomaticRun,
  onCancelPipeline,
  onOpenManualImport,
  unscoredCount = 0,
  isScoringUnscored = false,
  onScoreUnscored,
}) => {
  const primaryAction = hideRunAction ? null : isPipelineRunning ? (
    <Button
      size="sm"
      onClick={onCancelPipeline}
      disabled={isCancelling}
      variant="destructive"
      className="gap-2"
    >
      {isCancelling ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Square className="h-4 w-4" />
      )}
      <span>
        {isCancelling ? `Cancelling (${pipelineSources.length})` : `Cancel run`}
      </span>
    </Button>
  ) : (
    <Button
      size="sm"
      onClick={onOpenAutomaticRun}
      variant={isSearchComposerOpen ? "secondary" : "default"}
      className="gap-2"
      aria-pressed={isSearchComposerOpen}
    >
      {isSearchComposerOpen ? (
        <X className="h-4 w-4" />
      ) : (
        <Search className="h-4 w-4" />
      )}
      <span>{isSearchComposerOpen ? "Close search" : "Find jobs"}</span>
    </Button>
  );
  const actions = (
    <div className="flex items-center gap-2">
      {primaryAction}
      {onScoreUnscored ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="gap-2"
          disabled={
            isPipelineRunning || isScoringUnscored || unscoredCount === 0
          }
          onClick={onScoreUnscored}
        >
          {isScoringUnscored ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Gauge className="h-4 w-4" />
          )}
          {isScoringUnscored
            ? "Scoring..."
            : `Score unscored (${unscoredCount})`}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onOpenManualImport}
      >
        <FileText className="h-4 w-4" />
        Add a job
      </Button>
    </div>
  );

  return (
    <PageHeader
      icon={() => (
        <img src="/favicon.png" alt="" className="size-8 rounded-lg" />
      )}
      title="Job Ops"
      subtitle="Orchestrator"
      navOpen={navOpen}
      onNavOpenChange={onNavOpenChange}
      statusIndicator={
        isPipelineRunning ? (
          <StatusIndicator label="Search running" variant="amber" />
        ) : undefined
      }
      actions={actions}
    />
  );
};
