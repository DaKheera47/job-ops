import type { ManualImportResult } from "@client/components/ManualImportFlow";
import type {
  AppSettings,
  JobSource,
  WatchlistSelectedSource,
} from "@shared/types";
import type React from "react";
import type { AutomaticRunValues } from "./automatic-run";
import { RunModeModal } from "./RunModeModal";
import type { RunMode } from "./run-mode";
import type { PipelineSearchPresetComposerProps } from "./usePipelineSearchPresets";

interface OrchestratorSearchComposerProps
  extends PipelineSearchPresetComposerProps {
  mode: RunMode;
  settings: AppSettings | null;
  enabledSources: JobSource[];
  pipelineSources: JobSource[];
  watchlistSources: WatchlistSelectedSource[];
  selectedWatchlistSourceIds: string[];
  isPipelineRunning: boolean;
  onToggleSource: (source: JobSource, checked: boolean) => void;
  onSetPipelineSources: (sources: JobSource[]) => void;
  onToggleWatchlistSource: (sourceId: string, checked: boolean) => void;
  onSetSelectedWatchlistSourceIds: (ids: string[]) => void;
  isWatchlistSourcesLoading: boolean;
  onOpenChange: (open: boolean) => void;
  onModeChange: (mode: RunMode) => void;
  onSaveAndRunAutomatic: (values: AutomaticRunValues) => Promise<void>;
  onManualImported: (result: ManualImportResult) => Promise<void>;
}

export const OrchestratorSearchComposer: React.FC<
  OrchestratorSearchComposerProps
> = ({
  mode,
  settings,
  enabledSources,
  pipelineSources,
  watchlistSources,
  selectedWatchlistSourceIds,
  isPipelineRunning,
  onToggleSource,
  onSetPipelineSources,
  onToggleWatchlistSource,
  onSetSelectedWatchlistSourceIds,
  isWatchlistSourcesLoading,
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
}) => (
  <RunModeModal
    open={true}
    mode={mode}
    showCloseButton={false}
    showModeTabs={false}
    settings={settings}
    enabledSources={enabledSources}
    pipelineSources={pipelineSources}
    onToggleSource={onToggleSource}
    onSetPipelineSources={onSetPipelineSources}
    watchlistSources={watchlistSources}
    selectedWatchlistSourceIds={selectedWatchlistSourceIds}
    onToggleWatchlistSource={onToggleWatchlistSource}
    onSetSelectedWatchlistSourceIds={onSetSelectedWatchlistSourceIds}
    isWatchlistSourcesLoading={isWatchlistSourcesLoading}
    isPipelineRunning={isPipelineRunning}
    onOpenChange={onOpenChange}
    onModeChange={onModeChange}
    onSaveAndRunAutomatic={onSaveAndRunAutomatic}
    onManualImported={onManualImported}
    savedSearches={savedSearches}
    isSavedSearchesLoading={isSavedSearchesLoading}
    onCreateSavedSearch={onCreateSavedSearch}
    onUpdateSavedSearch={onUpdateSavedSearch}
    onDeleteSavedSearch={onDeleteSavedSearch}
    onApplySavedSearch={onApplySavedSearch}
  />
);
