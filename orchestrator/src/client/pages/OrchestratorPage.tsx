import * as api from "@client/api";
import { ManualImportSheet } from "@client/components/ManualImportSheet";
import { useSettings } from "@client/hooks/useSettings";
import type { Job } from "@shared/types.js";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { trackProductEvent } from "@/lib/analytics";
import { OrchestratorHeader } from "./orchestrator/OrchestratorHeader";
import { OrchestratorJobWorkspaceContainer } from "./orchestrator/OrchestratorJobWorkspaceContainer";
import { OrchestratorSearchComposer } from "./orchestrator/OrchestratorSearchComposer";
import { useOrchestratorData } from "./orchestrator/useOrchestratorData";
import { useOrchestratorFilters } from "./orchestrator/useOrchestratorFilters";
import {
  useNavigationRefresh,
  useOrchestratorNavigation,
} from "./orchestrator/useOrchestratorNavigation";
import { useOrchestratorUiState } from "./orchestrator/useOrchestratorUiState";
import { usePipelineControls } from "./orchestrator/usePipelineControls";
import { usePipelineSearchPresets } from "./orchestrator/usePipelineSearchPresets";
import { usePipelineSources } from "./orchestrator/usePipelineSources";
import { useWatchlistPipelineSources } from "./orchestrator/useWatchlistPipelineSources";
import { getEnabledSources } from "./orchestrator/utils";

export const OrchestratorPage: React.FC = () => {
  const [isManualImportOpen, setIsManualImportOpen] = useState(false);
  const [isScoringUnscored, setIsScoringUnscored] = useState(false);
  const filters = useOrchestratorFilters();
  const navigation = useOrchestratorNavigation({
    searchParams: filters.searchParams,
  });
  const { settings } = useSettings();
  const {
    jobs,
    selectedJob,
    selectedJobListItem,
    selectedJobLoadState,
    retrySelectedJob,
    stats,
    isLoading,
    isPipelineRunning,
    setIsPipelineRunning,
    pipelineTerminalEvent,
    setIsRefreshPaused,
    loadJobs,
    applySelectedJobUpdate,
  } = useOrchestratorData(navigation.selectedJobId);

  const handleJobUpdated = useCallback(
    async (job?: Job) => {
      if (job) {
        applySelectedJobUpdate(job);
        return;
      }
      await loadJobs();
    },
    [applySelectedJobUpdate, loadJobs],
  );

  useNavigationRefresh(loadJobs);

  const enabledSources = useMemo(
    () => getEnabledSources(settings ?? null),
    [settings],
  );
  const { pipelineSources, setPipelineSources, toggleSource } =
    usePipelineSources(enabledSources);
  const {
    watchlistSources,
    selectedWatchlistSourceIds,
    setSelectedWatchlistSourceIds,
    toggleWatchlistSource,
    isLoading: isWatchlistSourcesLoading,
  } = useWatchlistPipelineSources();

  const {
    isRunModeModalOpen,
    setIsRunModeModalOpen,
    isCancelling,
    openSearch,
    handleCancelPipeline,
    handleSaveAndRunAutomatic,
    handleManualImported,
  } = usePipelineControls({
    isPipelineRunning,
    setIsPipelineRunning,
    pipelineTerminalEvent,
    pipelineSources,
    watchlistSelectedSourceIds: selectedWatchlistSourceIds,
    loadJobs,
    navigateWithContext: navigation.navigateWithContext,
  });

  const isFirstRunWorkspace =
    !isLoading && jobs.length === 0 && !isPipelineRunning;
  const isSearchComposerVisible = isRunModeModalOpen || isFirstRunWorkspace;
  const wasSearchComposerVisible = useRef(false);

  useEffect(() => {
    if (isSearchComposerVisible && !wasSearchComposerVisible.current) {
      trackProductEvent("jobs_search_composer_opened", { mode: "automatic" });
    }
    wasSearchComposerVisible.current = isSearchComposerVisible;
  }, [isSearchComposerVisible]);

  const canToggleSearchComposer = !isFirstRunWorkspace;
  const searchPresetProps = usePipelineSearchPresets({
    enabled: isSearchComposerVisible,
  });
  const ui = useOrchestratorUiState({
    isSearchComposerVisible,
    selectedJobId: navigation.selectedJobId,
    onClearSelectedJob: () => navigation.handleSelectJobId(null),
  });
  const handleToggleAutomaticRun = useCallback(() => {
    if (isSearchComposerVisible && canToggleSearchComposer) {
      setIsRunModeModalOpen(false);
      return;
    }

    openSearch();
  }, [
    canToggleSearchComposer,
    isSearchComposerVisible,
    openSearch,
    setIsRunModeModalOpen,
  ]);

  const unscoredCount = useMemo(
    () =>
      jobs.filter(
        (job) => job.status === "discovered" && job.suitabilityScore == null,
      ).length,
    [jobs],
  );

  useEffect(() => {
    if (unscoredCount === 0) setIsScoringUnscored(false);
  }, [unscoredCount]);

  const handleScoreUnscored = useCallback(async () => {
    setIsScoringUnscored(true);
    try {
      const result = await api.scoreUnscoredJobs();
      if (!result.started) setIsScoringUnscored(false);
    } catch (error) {
      setIsScoringUnscored(false);
      toast.error(
        error instanceof Error ? error.message : "Failed to start scoring",
      );
    }
  }, []);

  return (
    <>
      <OrchestratorHeader
        navOpen={ui.navOpen}
        onNavOpenChange={ui.setNavOpen}
        isPipelineRunning={isPipelineRunning}
        isCancelling={isCancelling}
        pipelineSources={pipelineSources}
        hideRunAction={isSearchComposerVisible && !canToggleSearchComposer}
        isSearchComposerOpen={
          isSearchComposerVisible && canToggleSearchComposer
        }
        onOpenAutomaticRun={handleToggleAutomaticRun}
        onCancelPipeline={handleCancelPipeline}
        onOpenManualImport={() => {
          setIsManualImportOpen(true);
        }}
        unscoredCount={unscoredCount}
        isScoringUnscored={isScoringUnscored}
        onScoreUnscored={handleScoreUnscored}
      />

      <main
        className={
          isSearchComposerVisible
            ? "min-h-[calc(100dvh-6rem)]"
            : "container mx-auto space-y-6 px-4 py-6 pb-12"
        }
      >
        {isSearchComposerVisible ? (
          <OrchestratorSearchComposer
            settings={settings ?? null}
            enabledSources={enabledSources}
            pipelineSources={pipelineSources}
            onToggleSource={toggleSource}
            onSetPipelineSources={setPipelineSources}
            watchlistSources={watchlistSources}
            selectedWatchlistSourceIds={selectedWatchlistSourceIds}
            onToggleWatchlistSource={toggleWatchlistSource}
            onSetSelectedWatchlistSourceIds={setSelectedWatchlistSourceIds}
            isWatchlistSourcesLoading={isWatchlistSourcesLoading}
            isPipelineRunning={isPipelineRunning}
            onSaveAndRunAutomatic={handleSaveAndRunAutomatic}
            {...searchPresetProps}
          />
        ) : (
          <OrchestratorJobWorkspaceContainer
            jobs={jobs}
            selectedJob={selectedJob}
            selectedJobListItem={selectedJobListItem}
            selectedJobLoadState={selectedJobLoadState}
            retrySelectedJob={retrySelectedJob}
            stats={stats}
            isLoading={isLoading}
            isPipelineRunning={isPipelineRunning}
            loadJobs={handleJobUpdated}
            setIsRefreshPaused={setIsRefreshPaused}
            filters={filters}
            navigation={navigation}
            ui={ui}
            onFindJobs={openSearch}
          />
        )}
      </main>

      <ManualImportSheet
        open={isManualImportOpen}
        onOpenChange={setIsManualImportOpen}
        onImported={async (result) => {
          await handleManualImported(result);
        }}
      />
    </>
  );
};
