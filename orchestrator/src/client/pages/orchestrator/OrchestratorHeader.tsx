import { PageHeader, StatusIndicator } from "@client/components/layout";
import type { JobSource } from "@shared/types.js";
import { Loader2, Play, Square, X } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button";

interface OrchestratorHeaderProps {
  navOpen: boolean;
  onNavOpenChange: (open: boolean) => void;
  isPipelineRunning: boolean;
  isCancelling: boolean;
  pipelineSources: JobSource[];
  hideActions?: boolean;
  isSearchComposerOpen?: boolean;
  onOpenAutomaticRun: () => void;
  onCancelPipeline: () => void;
}

export const OrchestratorHeader: React.FC<OrchestratorHeaderProps> = ({
  navOpen,
  onNavOpenChange,
  isPipelineRunning,
  isCancelling,
  pipelineSources,
  hideActions = false,
  isSearchComposerOpen = false,
  onOpenAutomaticRun,
  onCancelPipeline,
}) => {
  const actions = hideActions ? null : isPipelineRunning ? (
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
      <span className="hidden sm:inline">
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
        <Play className="h-4 w-4" />
      )}
      <span className="hidden sm:inline">
        {isSearchComposerOpen ? "Close search" : "Run search"}
      </span>
    </Button>
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
