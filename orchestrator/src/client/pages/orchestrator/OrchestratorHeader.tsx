import { PageHeader, StatusIndicator } from "@client/components/layout";
import { useUiTranslation } from "@client/lib/i18n/language";
import type { JobSource } from "@shared/types.js";
import { FileText, Loader2, Search, Square, X } from "lucide-react";
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
}) => {
  const { t: uiT } = useUiTranslation();
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
      <span>
        {isSearchComposerOpen ? uiT("Close search") : uiT("Find jobs")}
      </span>
    </Button>
  );
  const actions = (
    <div className="flex items-center gap-2">
      {primaryAction}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onOpenManualImport}
      >
        <FileText className="h-4 w-4" />
        {uiT("Add a job")}
      </Button>
    </div>
  );
  return (
    <PageHeader
      icon={() => (
        <img src="/favicon.png" alt="" className="size-8 rounded-lg" />
      )}
      title="Job Ops"
      subtitle={uiT("Orchestrator")}
      navOpen={navOpen}
      onNavOpenChange={onNavOpenChange}
      statusIndicator={
        isPipelineRunning ? (
          <StatusIndicator label={uiT("Search running")} variant="amber" />
        ) : undefined
      }
      actions={actions}
    />
  );
};
