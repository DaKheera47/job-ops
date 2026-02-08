/**
 * Orchestrator layout with a split list/detail experience.
 */

import { useSettings } from "@client/hooks/useSettings";
import {
  formatCountryLabel,
  getCompatibleSourcesForCountry,
} from "@shared/location-support.js";
import type { JobSource } from "@shared/types.js";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent } from "@/components/ui/drawer";
import * as api from "../api";
import type { AutomaticRunValues } from "./orchestrator/automatic-run";
import { deriveExtractorLimits } from "./orchestrator/automatic-run";
import type { FilterTab } from "./orchestrator/constants";
import { FloatingBulkActionsBar } from "./orchestrator/FloatingBulkActionsBar";
import { JobDetailPanel } from "./orchestrator/JobDetailPanel";
import { JobListPanel } from "./orchestrator/JobListPanel";
import { OrchestratorFilters } from "./orchestrator/OrchestratorFilters";
import { OrchestratorHeader } from "./orchestrator/OrchestratorHeader";
import { OrchestratorSummary } from "./orchestrator/OrchestratorSummary";
import { RunModeModal } from "./orchestrator/RunModeModal";
import type { RunMode } from "./orchestrator/run-mode";
import { useBulkJobSelection } from "./orchestrator/useBulkJobSelection";
import { useFilteredJobs } from "./orchestrator/useFilteredJobs";
import { useOrchestratorData } from "./orchestrator/useOrchestratorData";
import { useOrchestratorFilters } from "./orchestrator/useOrchestratorFilters";
import { usePipelineSources } from "./orchestrator/usePipelineSources";
import {
  getEnabledSources,
  getJobCounts,
  getSourcesWithJobs,
} from "./orchestrator/utils";

export const OrchestratorPage: React.FC = () => {
  const { tab, jobId } = useParams<{ tab: string; jobId?: string }>();
  const navigate = useNavigate();
  const {
    searchParams,
    searchQuery,
    setSearchQuery,
    sourceFilter,
    setSourceFilter,
    sponsorFilter,
    setSponsorFilter,
    salaryFilter,
    setSalaryFilter,
    sort,
    setSort,
    resetFilters,
  } = useOrchestratorFilters();

  const activeTab = useMemo(() => {
    const validTabs: FilterTab[] = ["ready", "discovered", "applied", "all"];
    if (tab && validTabs.includes(tab as FilterTab)) {
      return tab as FilterTab;
    }
    return "ready";
  }, [tab]);

  // Helper to change URL while preserving search params
  const navigateWithContext = useCallback(
    (newTab: string, newJobId?: string | null, isReplace = false) => {
      const search = searchParams.toString();
      const suffix = search ? `?${search}` : "";
      const path = newJobId
        ? `/${newTab}/${newJobId}${suffix}`
        : `/${newTab}${suffix}`;
      navigate(path, { replace: isReplace });
    },
    [navigate, searchParams],
  );

  const selectedJobId = jobId || null;

  // Effect to sync URL if it was invalid
  useEffect(() => {
    const validTabs: FilterTab[] = ["ready", "discovered", "applied", "all"];
    if (tab && !validTabs.includes(tab as FilterTab)) {
      navigateWithContext("ready", null, true);
    }
  }, [tab, navigateWithContext]);

  const [navOpen, setNavOpen] = useState(false);
  const [isRunModeModalOpen, setIsRunModeModalOpen] = useState(false);
  const [runMode, setRunMode] = useState<RunMode>("automatic");
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : false,
  );

  const setActiveTab = useCallback(
    (newTab: FilterTab) => {
      navigateWithContext(newTab, selectedJobId);
    },
    [navigateWithContext, selectedJobId],
  );

  const handleSelectJobId = useCallback(
    (id: string | null) => {
      navigateWithContext(activeTab, id);
    },
    [navigateWithContext, activeTab],
  );

  const { settings, refreshSettings } = useSettings();
  const {
    jobs,
    stats,
    isLoading,
    isPipelineRunning,
    setIsPipelineRunning,
    setIsRefreshPaused,
    loadJobs,
  } = useOrchestratorData();
  const enabledSources = useMemo(
    () => getEnabledSources(settings ?? null),
    [settings],
  );
  const { pipelineSources, setPipelineSources, toggleSource } =
    usePipelineSources(enabledSources);

  const activeJobs = useFilteredJobs(
    jobs,
    activeTab,
    sourceFilter,
    sponsorFilter,
    salaryFilter,
    searchQuery,
    sort,
  );
  const counts = useMemo(() => getJobCounts(jobs), [jobs]);
  const sourcesWithJobs = useMemo(() => getSourcesWithJobs(jobs), [jobs]);
  const selectedJob = useMemo(
    () =>
      selectedJobId
        ? (jobs.find((job) => job.id === selectedJobId) ?? null)
        : null,
    [jobs, selectedJobId],
  );
  const {
    selectedJobIds,
    canSkipSelected,
    canMoveSelected,
    canRescoreSelected,
    bulkActionInFlight,
    toggleSelectJob,
    toggleSelectAll,
    clearSelection,
    runBulkAction,
  } = useBulkJobSelection({
    activeJobs,
    activeTab,
    loadJobs,
  });

  useEffect(() => {
    if (isLoading || sourceFilter === "all") return;
    if (!sourcesWithJobs.includes(sourceFilter)) {
      setSourceFilter("all");
    }
  }, [isLoading, sourceFilter, setSourceFilter, sourcesWithJobs]);

  const openRunMode = useCallback((mode: RunMode) => {
    setRunMode(mode);
    setIsRunModeModalOpen(true);
  }, []);

  const handleManualImported = useCallback(
    async (importedJobId: string) => {
      await loadJobs();
      navigateWithContext("discovered", importedJobId);
    },
    [loadJobs, navigateWithContext],
  );

  const startPipelineRun = useCallback(
    async (config: {
      topN: number;
      minSuitabilityScore: number;
      sources: JobSource[];
    }) => {
      try {
        setIsPipelineRunning(true);
        setIsCancelling(false);
        await api.runPipeline(config);
        toast.message("Pipeline started", {
          description: `Sources: ${config.sources.join(", ")}. This may take a few minutes.`,
        });

        const pollInterval = setInterval(async () => {
          try {
            const status = await api.getPipelineStatus();
            if (!status.isRunning) {
              clearInterval(pollInterval);
              setIsPipelineRunning(false);
              setIsCancelling(false);
              await loadJobs();
              const outcome = status.lastRun?.status;
              if (outcome === "cancelled") {
                toast.message("Pipeline cancelled");
              } else if (outcome === "failed") {
                toast.error(status.lastRun?.errorMessage || "Pipeline failed");
              } else {
                toast.success("Pipeline completed");
              }
            }
          } catch {
            // Ignore errors
          }
        }, 5000);
      } catch (error) {
        setIsPipelineRunning(false);
        setIsCancelling(false);
        const message =
          error instanceof Error ? error.message : "Failed to start pipeline";
        toast.error(message);
      }
    },
    [loadJobs, setIsPipelineRunning],
  );

  const handleCancelPipeline = useCallback(async () => {
    if (isCancelling || !isPipelineRunning) return;

    try {
      setIsCancelling(true);
      const result = await api.cancelPipeline();
      toast.message(result.message);
    } catch (error) {
      setIsCancelling(false);
      const message =
        error instanceof Error ? error.message : "Failed to cancel pipeline";
      toast.error(message);
    }
  }, [isCancelling, isPipelineRunning]);

  const handleSaveAndRunAutomatic = useCallback(
    async (values: AutomaticRunValues) => {
      const compatibleSources = getCompatibleSourcesForCountry(
        pipelineSources,
        values.country,
      );
      if (compatibleSources.length === 0) {
        toast.error(
          "No compatible sources for the selected country. Choose another country or source.",
        );
        return;
      }

      const limits = deriveExtractorLimits({
        budget: values.runBudget,
        searchTerms: values.searchTerms,
        sources: compatibleSources,
      });
      await api.updateSettings({
        searchTerms: values.searchTerms,
        jobspyResultsWanted: limits.jobspyResultsWanted,
        gradcrackerMaxJobsPerTerm: limits.gradcrackerMaxJobsPerTerm,
        ukvisajobsMaxJobs: limits.ukvisajobsMaxJobs,
        jobspyCountryIndeed: values.country,
        jobspyLocation: formatCountryLabel(values.country),
      });
      await refreshSettings();
      await startPipelineRun({
        topN: values.topN,
        minSuitabilityScore: values.minSuitabilityScore,
        sources: compatibleSources,
      });
      setIsRunModeModalOpen(false);
    },
    [pipelineSources, refreshSettings, startPipelineRun],
  );

  const handleSelectJob = (id: string) => {
    handleSelectJobId(id);
    if (!isDesktop) {
      setIsDetailDrawerOpen(true);
    }
  };

  useEffect(() => {
    if (activeJobs.length === 0) {
      if (selectedJobId) handleSelectJobId(null);
      return;
    }
    if (!selectedJobId || !activeJobs.some((job) => job.id === selectedJobId)) {
      // Auto-select first job ONLY on desktop
      if (isDesktop) {
        navigateWithContext(activeTab, activeJobs[0].id, true);
      }
    }
  }, [
    activeJobs,
    selectedJobId,
    isDesktop,
    activeTab,
    navigateWithContext,
    handleSelectJobId,
  ]);

  useEffect(() => {
    if (!selectedJobId) {
      setIsDetailDrawerOpen(false);
    } else if (!isDesktop) {
      setIsDetailDrawerOpen(true);
    }
  }, [selectedJobId, isDesktop]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(min-width: 1024px)");
    const handleChange = () => setIsDesktop(media.matches);
    handleChange();
    if (media.addEventListener) {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }
    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  useEffect(() => {
    if (isDesktop && isDetailDrawerOpen) {
      setIsDetailDrawerOpen(false);
    }
  }, [isDesktop, isDetailDrawerOpen]);

  const onDrawerOpenChange = (open: boolean) => {
    setIsDetailDrawerOpen(open);
    if (!open && !isDesktop) {
      // Clear job ID from URL when closing drawer on mobile
      handleSelectJobId(null);
    }
  };

  return (
    <>
      <OrchestratorHeader
        navOpen={navOpen}
        onNavOpenChange={setNavOpen}
        isPipelineRunning={isPipelineRunning}
        isCancelling={isCancelling}
        pipelineSources={pipelineSources}
        onOpenAutomaticRun={() => openRunMode("automatic")}
        onCancelPipeline={handleCancelPipeline}
      />

      <main
        className={`container mx-auto max-w-7xl space-y-6 px-4 py-6 ${
          selectedJobIds.size > 0 ? "pb-36 lg:pb-12" : "pb-12"
        }`}
      >
        <OrchestratorSummary
          stats={stats}
          isPipelineRunning={isPipelineRunning}
        />

        {/* Main content: tabs/filters -> list/detail */}
        <section className="space-y-4">
          <OrchestratorFilters
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={counts}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            sponsorFilter={sponsorFilter}
            onSponsorFilterChange={setSponsorFilter}
            salaryFilter={salaryFilter}
            onSalaryFilterChange={setSalaryFilter}
            sourcesWithJobs={sourcesWithJobs}
            sort={sort}
            onSortChange={setSort}
            onResetFilters={resetFilters}
            filteredCount={activeJobs.length}
          />

          {/* List/Detail grid - directly under tabs, no extra section */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)]">
            {/* Primary region: Job list with highest visual weight */}
            <JobListPanel
              isLoading={isLoading}
              jobs={jobs}
              activeJobs={activeJobs}
              selectedJobId={selectedJobId}
              selectedJobIds={selectedJobIds}
              activeTab={activeTab}
              searchQuery={searchQuery}
              onSelectJob={handleSelectJob}
              onToggleSelectJob={toggleSelectJob}
              onToggleSelectAll={toggleSelectAll}
            />

            {/* Inspector panel: visually subordinate to list */}
            {isDesktop && (
              <div className="min-w-0 rounded-lg border border-border/40 bg-muted/5 p-4 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
                <JobDetailPanel
                  activeTab={activeTab}
                  activeJobs={activeJobs}
                  selectedJob={selectedJob}
                  onSelectJobId={handleSelectJobId}
                  onJobUpdated={loadJobs}
                  onPauseRefreshChange={setIsRefreshPaused}
                />
              </div>
            )}
          </div>
        </section>
      </main>

      <FloatingBulkActionsBar
        selectedCount={selectedJobIds.size}
        canMoveSelected={canMoveSelected}
        canSkipSelected={canSkipSelected}
        canRescoreSelected={canRescoreSelected}
        bulkActionInFlight={bulkActionInFlight !== null}
        onMoveToReady={() => void runBulkAction("move_to_ready")}
        onSkipSelected={() => void runBulkAction("skip")}
        onRescoreSelected={() => void runBulkAction("rescore")}
        onClear={clearSelection}
      />

      <RunModeModal
        open={isRunModeModalOpen}
        mode={runMode}
        settings={settings ?? null}
        enabledSources={enabledSources}
        pipelineSources={pipelineSources}
        onToggleSource={toggleSource}
        onSetPipelineSources={setPipelineSources}
        isPipelineRunning={isPipelineRunning}
        onOpenChange={setIsRunModeModalOpen}
        onModeChange={setRunMode}
        onSaveAndRunAutomatic={handleSaveAndRunAutomatic}
        onManualImported={handleManualImported}
      />

      {!isDesktop && (
        <Drawer open={isDetailDrawerOpen} onOpenChange={onDrawerOpenChange}>
          <DrawerContent className="max-h-[90vh]">
            <div className="flex items-center justify-between px-4 pt-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Job details
              </div>
              <DrawerClose asChild>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs">
                  Close
                </Button>
              </DrawerClose>
            </div>
            <div className="max-h-[calc(90vh-3.5rem)] overflow-y-auto px-4 pb-6 pt-3">
              <JobDetailPanel
                activeTab={activeTab}
                activeJobs={activeJobs}
                selectedJob={selectedJob}
                onSelectJobId={handleSelectJobId}
                onJobUpdated={loadJobs}
                onPauseRefreshChange={setIsRefreshPaused}
              />
            </div>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
};
