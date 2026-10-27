import type {
  AppSettings,
  JobSource,
  WatchlistSelectedSource,
} from "@shared/types";
import type React from "react";
import { AutomaticRunTab } from "./AutomaticRunTab";
import type { AutomaticRunValues } from "./automatic-run";
import type { PipelineSearchPresetComposerProps } from "./usePipelineSearchPresets";

interface OrchestratorSearchComposerProps
  extends PipelineSearchPresetComposerProps {
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
  onSaveAndRunAutomatic: (values: AutomaticRunValues) => Promise<void>;
}

export const OrchestratorSearchComposer: React.FC<
  OrchestratorSearchComposerProps
> = ({
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
  onSaveAndRunAutomatic,
  savedSearches,
  isSavedSearchesLoading,
  onCreateSavedSearch,
  onUpdateSavedSearch,
  onDeleteSavedSearch,
  onApplySavedSearch,
}) => {
  if (!settings) return null;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <AutomaticRunTab
        open
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
        onSaveAndRun={onSaveAndRunAutomatic}
        savedSearches={savedSearches}
        isSavedSearchesLoading={isSavedSearchesLoading}
        onCreateSavedSearch={onCreateSavedSearch}
        onUpdateSavedSearch={onUpdateSavedSearch}
        onDeleteSavedSearch={onDeleteSavedSearch}
        onApplySavedSearch={onApplySavedSearch}
      />
    </section>
  );
};
