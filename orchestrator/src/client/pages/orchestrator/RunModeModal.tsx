import type { ManualImportResult } from "@client/components/ManualImportFlow";
import { ManualImportFlow } from "@client/components/ManualImportFlow";
import type {
  AppSettings,
  CreatePipelineSearchPresetInput,
  JobSource,
  PipelineSearchPreset,
  UpdatePipelineSearchPresetInput,
} from "@shared/types";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AutomaticRunTab } from "./AutomaticRunTab";
import type { AutomaticRunValues } from "./automatic-run";
import type { RunMode } from "./run-mode";

interface RunModeModalProps {
  open: boolean;
  mode: RunMode;
  showCloseButton?: boolean;
  showModeTabs?: boolean;
  settings: AppSettings | null;
  enabledSources: JobSource[];
  pipelineSources: JobSource[];
  onToggleSource: (source: JobSource, checked: boolean) => void;
  onSetPipelineSources: (sources: JobSource[]) => void;
  isPipelineRunning: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: RunMode) => void;
  onSaveAndRunAutomatic: (values: AutomaticRunValues) => Promise<void>;
  onManualImported: (result: ManualImportResult) => Promise<void>;
  savedSearches?: PipelineSearchPreset[];
  isSavedSearchesLoading?: boolean;
  onCreateSavedSearch?: (
    input: CreatePipelineSearchPresetInput,
  ) => Promise<PipelineSearchPreset>;
  onUpdateSavedSearch?: (
    id: string,
    input: UpdatePipelineSearchPresetInput,
  ) => Promise<PipelineSearchPreset>;
  onDeleteSavedSearch?: (id: string) => Promise<void>;
  onApplySavedSearch?: (preset: PipelineSearchPreset) => Promise<void>;
}

export const RunModeModal: React.FC<RunModeModalProps> = ({
  open,
  mode,
  showCloseButton = true,
  showModeTabs = true,
  settings,
  enabledSources,
  pipelineSources,
  onToggleSource,
  onSetPipelineSources,
  isPipelineRunning,
  onOpenChange,
  onModeChange,
  onSaveAndRunAutomatic,
  onManualImported,
  savedSearches,
  isSavedSearchesLoading,
  onCreateSavedSearch,
  onUpdateSavedSearch,
  onDeleteSavedSearch,
  onApplySavedSearch,
}) => {
  const isManualMode = mode === "manual";
  const showTopHeader = isManualMode || showModeTabs;

  if (!open) {
    return null;
  }

  return (
    <section className="flex min-h-[calc(100dvh-6rem)] flex-col">
      <div
        className={cn(
          "mx-auto flex w-full flex-1 flex-col px-4 sm:px-6 lg:px-8",
          isManualMode ? "max-w-6xl py-6" : "max-w-5xl py-8 sm:py-10",
        )}
      >
        {showTopHeader ? (
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.24em] text-muted-foreground">
                Search composer
              </p>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {isManualMode
                  ? "Review job details"
                  : "What kind of jobs are you looking for?"}
              </h1>
              <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {isManualMode
                  ? "Add a job description, review the extracted details, then import."
                  : "Describe the search in plain language. AI fills the settings for review, then you run the search."}
              </p>
            </div>
            {showCloseButton ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
            ) : null}
          </div>
        ) : showCloseButton ? (
          <div className="mb-2 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
          </div>
        ) : null}

        <Tabs
          value={mode}
          onValueChange={(value) => onModeChange(value as RunMode)}
          className="flex min-h-0 flex-1 flex-col"
        >
          {showModeTabs ? (
            <TabsList className="grid w-full max-w-sm grid-cols-2">
              <TabsTrigger value="automatic">Automatic</TabsTrigger>
              <TabsTrigger value="manual">Manual</TabsTrigger>
            </TabsList>
          ) : null}

          <TabsContent value="automatic" className="min-h-0 flex-1">
            <AutomaticRunTab
              open={open}
              settings={settings}
              enabledSources={enabledSources}
              pipelineSources={pipelineSources}
              onToggleSource={onToggleSource}
              onSetPipelineSources={onSetPipelineSources}
              isPipelineRunning={isPipelineRunning}
              onSaveAndRun={onSaveAndRunAutomatic}
              savedSearches={savedSearches}
              isSavedSearchesLoading={isSavedSearchesLoading}
              onCreateSavedSearch={onCreateSavedSearch}
              onUpdateSavedSearch={onUpdateSavedSearch}
              onDeleteSavedSearch={onDeleteSavedSearch}
              onApplySavedSearch={onApplySavedSearch}
            />
          </TabsContent>

          <TabsContent value="manual" className="min-h-0 flex-1">
            <ManualImportFlow
              active={open && mode === "manual"}
              onImported={onManualImported}
              onClose={() => onOpenChange(false)}
              showReviewIntro={false}
            />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
};
