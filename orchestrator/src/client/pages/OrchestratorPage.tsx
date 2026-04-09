import { useKeyboardAvailability } from "@client/hooks/useKeyboardAvailability";
import { useSettings } from "@client/hooks/useSettings";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent } from "@/components/ui/drawer";
import { KeyboardShortcutBar } from "../components/KeyboardShortcutBar";
import { KeyboardShortcutDialog } from "../components/KeyboardShortcutDialog";
import { useDemoInfo } from "../hooks/useDemoInfo";
import { type FilterTab, tabs } from "./orchestrator/constants";
import { FloatingJobActionsBar } from "./orchestrator/FloatingJobActionsBar";
import { JobCommandBar } from "./orchestrator/JobCommandBar";
import { JobDetailPanel } from "./orchestrator/JobDetailPanel";
import { JobListPanel } from "./orchestrator/JobListPanel";
import { OrchestratorFilters } from "./orchestrator/OrchestratorFilters";
import { OrchestratorHeader } from "./orchestrator/OrchestratorHeader";
import { OrchestratorSummary } from "./orchestrator/OrchestratorSummary";
import { RunModeModal } from "./orchestrator/RunModeModal";
import { useFilteredJobs } from "./orchestrator/useFilteredJobs";
import { useJobSelectionActions } from "./orchestrator/useJobSelectionActions";
import { useKeyboardShortcuts } from "./orchestrator/useKeyboardShortcuts";
import { useOrchestratorData } from "./orchestrator/useOrchestratorData";
import { useOrchestratorFilters } from "./orchestrator/useOrchestratorFilters";
import { usePipelineControls } from "./orchestrator/usePipelineControls";
import { usePipelineSources } from "./orchestrator/usePipelineSources";
import { useScrollToJobItem } from "./orchestrator/useScrollToJobItem";
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
    sourceFilter,
    setSourceFilter,
    sponsorFilter,
    setSponsorFilter,
    salaryFilter,
    setSalaryFilter,
    dateFilter,
    setDateFilter,
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
        ? `/jobs/${newTab}/${newJobId}${suffix}`
        : `/jobs/${newTab}${suffix}`;
      navigate(path, { replace: isReplace });
    },
    [navigate, searchParams],
  );

  const selectedJobId = jobId || null;

  // Effect to sync URL if it was invalid
  useEffect(() => {
    if (tab === "in_progress") {
      navigate("/applications/in-progress", { replace: true });
      return;
    }
    const validTabs: FilterTab[] = ["ready", "discovered", "applied", "all"];
    if (tab && !validTabs.includes(tab as FilterTab)) {
      navigateWithContext("ready", null, true);
    }
  }, [tab, navigate, navigateWithContext]);

  const [navOpen, setNavOpen] = useState(false);
  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const hasKeyboard = useKeyboardAvailability();

  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(min-width: 1024px)").matches
      : false,
  );

  const handleSelectJobId = useCallback(
    (id: string | null) => {
      navigateWithContext(activeTab, id);
    },
    [navigateWithContext, activeTab],
  );

  const { settings } = useSettings();
  const demoInfo = useDemoInfo();
  const {
    jobs,
    selectedJob,
    stats,
    isLoading,
    isPipelineRunning,
    setIsPipelineRunning,
    pipelineTerminalEvent,
    setIsRefreshPaused,
    loadJobs,
  } = useOrchestratorData(selectedJobId);
  const enabledSources = useMemo(
    () => getEnabledSources(settings ?? null),
    [settings],
  );
  const { pipelineSources, setPipelineSources, toggleSource } =
    usePipelineSources(enabledSources);

  const {
    isRunModeModalOpen,
    setIsRunModeModalOpen,
    runMode,
    setRunMode,
    isCancelling,
    openRunMode,
    handleCancelPipeline,
    handleSaveAndRunAutomatic,
    handleManualImported,
  } = usePipelineControls({
    isPipelineRunning,
    setIsPipelineRunning,
    pipelineTerminalEvent,
    pipelineSources,
    loadJobs,
    navigateWithContext,
  });

  const activeJobs = useFilteredJobs(
    jobs,
    activeTab,
    dateFilter,
    sourceFilter,
    sponsorFilter,
    salaryFilter,
    sort,
  );
  const setActiveTab = useCallback(
    (newTab: FilterTab) => {
      // Keep selected job if it belongs to the target tab, otherwise clear it.
      // The auto-select effect will pick the first job on desktop when cleared.
      const tabDef = tabs.find((t) => t.id === newTab);
      const selectedItem = selectedJobId
        ? jobs.find((j) => j.id === selectedJobId)
        : null;
      const jobFitsTab =
        selectedItem &&
        (tabDef?.statuses.length === 0 ||
          tabDef?.statuses.includes(selectedItem.status));
      navigateWithContext(newTab, jobFitsTab ? selectedJobId : null);
    },
    [navigateWithContext, selectedJobId, jobs],
  );

  // Synchronously null-out selectedJob when it doesn't belong to the current
  // tab. The data hook resolves selectedJob from the full (unfiltered) job list
  // via useEffect, so it lags by one render frame after a tab switch — without
  // this guard the detail panel would briefly show the old job with the new
  // tab's action buttons.
  const visibleSelectedJob = useMemo(() => {
    if (!selectedJob) return null;
    const tabDef = tabs.find((t) => t.id === activeTab);
    if (!tabDef || tabDef.statuses.length === 0) return selectedJob;
    return tabDef.statuses.includes(selectedJob.status) ? selectedJob : null;
  }, [selectedJob, activeTab]);

  const counts = useMemo(() => getJobCounts(jobs), [jobs]);
  const displayedCounts = useMemo(() => counts, [counts]);
  const sourcesWithJobs = useMemo(() => getSourcesWithJobs(jobs), [jobs]);
  const {
    selectedJobIds,
    canSkipSelected,
    canMoveSelected,
    canRescoreSelected,
    jobActionInFlight,
    toggleSelectJob,
    toggleSelectAll,
    clearSelection,
    runJobAction,
  } = useJobSelectionActions({
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

  const handleSelectJob = (id: string) => {
    handleSelectJobId(id);
    if (!isDesktop) {
      setIsDetailDrawerOpen(true);
    }
  };

  const { requestScrollToJob } = useScrollToJobItem({
    activeJobs,
    selectedJobId,
    isDesktop,
    onEnsureJobSelected: (id) => navigateWithContext(activeTab, id, true),
  });

  const isAnyModalOpen =
    isRunModeModalOpen ||
    isCommandBarOpen ||
    isFiltersOpen ||
    isHelpDialogOpen ||
    isDetailDrawerOpen ||
    navOpen;

  const isAnyModalOpenExcludingCommandBar =
    isRunModeModalOpen ||
    isFiltersOpen ||
    isHelpDialogOpen ||
    isDetailDrawerOpen ||
    navOpen;

  const isAnyModalOpenExcludingHelp =
    isRunModeModalOpen ||
    isCommandBarOpen ||
    isFiltersOpen ||
    isDetailDrawerOpen ||
    navOpen;

  useKeyboardShortcuts({
    isAnyModalOpen,
    isAnyModalOpenExcludingCommandBar,
    isAnyModalOpenExcludingHelp,
    activeTab,
    activeJobs,
    selectedJobId,
    selectedJob: visibleSelectedJob,
    selectedJobIds,
    isDesktop,
    handleSelectJobId,
    requestScrollToJob,
    setActiveTab,
    setIsCommandBarOpen,
    setIsHelpDialogOpen,
    clearSelection,
    toggleSelectJob,
    runJobAction,
    loadJobs,
  });

  const handleCommandSelectJob = useCallback(
    (targetTab: FilterTab, id: string) => {
      requestScrollToJob(id, { ensureSelected: true });
      const nextParams = new URLSearchParams(searchParams);
      for (const key of [
        "source",
        "sponsor",
        "salaryMode",
        "salaryMin",
        "salaryMax",
        "minSalary",
        "date",
        "appliedRange",
        "appliedStart",
        "appliedEnd",
      ]) {
        nextParams.delete(key);
      }
      const query = nextParams.toString();
      navigate(`/jobs/${targetTab}/${id}${query ? `?${query}` : ""}`);
      if (!isDesktop) {
        setIsDetailDrawerOpen(true);
      }
    },
    [isDesktop, navigate, requestScrollToJob, searchParams],
  );

  useEffect(() => {
    if (activeJobs.length === 0) {
      if (selectedJobId) handleSelectJobId(null);
      return;
    }
    if (!selectedJobId) {
      // Auto-select first job ONLY on desktop when nothing is currently selected.
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

  useEffect(() => {
    if (demoInfo?.demoMode) return;
    if (!hasKeyboard) return;
    const hasSeen = localStorage.getItem("has-seen-keyboard-shortcuts");
    if (!hasSeen) {
      setIsHelpDialogOpen(true);
    }
  }, [demoInfo?.demoMode, hasKeyboard]);

  const onDrawerOpenChange = (open: boolean) => {
    setIsDetailDrawerOpen(open);
    if (!open && !isDesktop) {
      // Clear job ID from URL when closing drawer on mobile
      handleSelectJobId(null);
    }
  };

  const primaryEmptyStateAction = useMemo(() => {
    if (activeTab === "ready" && counts.discovered > 0) {
      return {
        label: "Tailor discovered jobs",
        onClick: () => setActiveTab("discovered"),
      };
    }

    if (activeTab === "discovered" || activeTab === "all") {
      return {
        label: "Run pipeline",
        onClick: () => openRunMode("automatic"),
      };
    }

    return undefined;
  }, [activeTab, counts.discovered, openRunMode, setActiveTab]);

  const secondaryEmptyStateAction = useMemo(() => {
    if (activeTab === "ready") {
      return {
        label: "Run pipeline",
        onClick: () => openRunMode("automatic"),
      };
    }

    return undefined;
  }, [activeTab, openRunMode]);

  const emptyStateMessage = useMemo(() => {
    if (dateFilter.dimensions.length === 0) {
      return undefined;
    }

    return "No jobs match the selected date filters.";
  }, [dateFilter.dimensions.length]);

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
        className={`container mx-auto space-y-6 px-4 py-6 ${
          selectedJobIds.size > 0 ? "pb-36 lg:pb-12" : "pb-12"
        }`}
      >
        <OrchestratorSummary
          stats={stats}
          isPipelineRunning={isPipelineRunning}
        />

        {/* Main content: tabs/filters -> list/detail */}
        <section className="space-y-4">
          <JobCommandBar
            jobs={jobs}
            onSelectJob={handleCommandSelectJob}
            open={isCommandBarOpen}
            onOpenChange={setIsCommandBarOpen}
            enabled={!isAnyModalOpenExcludingCommandBar}
          />
          <OrchestratorFilters
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={displayedCounts}
            onOpenCommandBar={() => setIsCommandBarOpen(true)}
            isFiltersOpen={isFiltersOpen}
            onFiltersOpenChange={setIsFiltersOpen}
            sourceFilter={sourceFilter}
            onSourceFilterChange={setSourceFilter}
            sponsorFilter={sponsorFilter}
            onSponsorFilterChange={setSponsorFilter}
            salaryFilter={salaryFilter}
            onSalaryFilterChange={setSalaryFilter}
            dateFilter={dateFilter}
            onDateFilterChange={setDateFilter}
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
              onSelectJob={handleSelectJob}
              onToggleSelectJob={toggleSelectJob}
              onToggleSelectAll={toggleSelectAll}
              primaryEmptyStateAction={primaryEmptyStateAction}
              secondaryEmptyStateAction={secondaryEmptyStateAction}
              emptyStateMessage={emptyStateMessage}
            />

            {/* Inspector panel: visually subordinate to list */}
            {isDesktop && (
              <div className="min-w-0 rounded-lg border border-border/40 bg-muted/5 p-4 lg:sticky lg:top-24 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
                <JobDetailPanel
                  activeTab={activeTab}
                  activeJobs={activeJobs}
                  selectedJob={visibleSelectedJob}
                  onSelectJobId={handleSelectJobId}
                  onJobUpdated={loadJobs}
                  onPauseRefreshChange={setIsRefreshPaused}
                />
              </div>
            )}
          </div>
        </section>
      </main>

      <FloatingJobActionsBar
        selectedCount={selectedJobIds.size}
        canMoveSelected={canMoveSelected}
        canSkipSelected={canSkipSelected}
        canRescoreSelected={canRescoreSelected}
        jobActionInFlight={jobActionInFlight !== null}
        onMoveToReady={() => void runJobAction("move_to_ready")}
        onSkipSelected={() => void runJobAction("skip")}
        onRescoreSelected={() => void runJobAction("rescore")}
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
                selectedJob={visibleSelectedJob}
                onSelectJobId={handleSelectJobId}
                onJobUpdated={loadJobs}
                onPauseRefreshChange={setIsRefreshPaused}
              />
            </div>
          </DrawerContent>
        </Drawer>
      )}

      <KeyboardShortcutBar activeTab={activeTab} />
      <KeyboardShortcutDialog
        open={isHelpDialogOpen}
        onOpenChange={(open) => {
          setIsHelpDialogOpen(open);
          if (!open) {
            localStorage.setItem("has-seen-keyboard-shortcuts", "true");
          }
        }}
        activeTab={activeTab}
      />
    </>
  );
};
