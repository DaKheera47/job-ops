import {
  useMarkAsAppliedMutation,
  useSkipJobMutation,
} from "@client/hooks/queries/useJobMutations";
import { useHotkeys } from "@client/hooks/useHotkeys";
import { useProfile } from "@client/hooks/useProfile";
import { useSettings } from "@client/hooks/useSettings";
import { SHORTCUTS } from "@client/lib/shortcut-map";
import {
  formatCountryLabel,
  getCompatibleSourcesForCountry,
} from "@shared/location-support.js";
import type { JobSource } from "@shared/types.js";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent } from "@/components/ui/drawer";
import { safeFilenamePart } from "@/lib/utils";
import * as api from "../api";
import { KeyboardShortcutBar } from "../components/KeyboardShortcutBar";
import { KeyboardShortcutDialog } from "../components/KeyboardShortcutDialog";
import type { AutomaticRunValues } from "./orchestrator/automatic-run";
import {
  deriveExtractorLimits,
  serializeCityLocationsSetting,
} from "./orchestrator/automatic-run";
import type { FilterTab } from "./orchestrator/constants";
import { tabs } from "./orchestrator/constants";
import { FloatingJobActionsBar } from "./orchestrator/FloatingJobActionsBar";
import { JobCommandBar } from "./orchestrator/JobCommandBar";
import { JobDetailPanel } from "./orchestrator/JobDetailPanel";
import { JobListPanel } from "./orchestrator/JobListPanel";
import { OrchestratorFilters } from "./orchestrator/OrchestratorFilters";
import { OrchestratorHeader } from "./orchestrator/OrchestratorHeader";
import { OrchestratorSummary } from "./orchestrator/OrchestratorSummary";
import { RunModeModal } from "./orchestrator/RunModeModal";
import type { RunMode } from "./orchestrator/run-mode";
import { useFilteredJobs } from "./orchestrator/useFilteredJobs";
import { useJobSelectionActions } from "./orchestrator/useJobSelectionActions";
import { useOrchestratorData } from "./orchestrator/useOrchestratorData";
import { useOrchestratorFilters } from "./orchestrator/useOrchestratorFilters";
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
  const [isRunModeModalOpen, setIsRunModeModalOpen] = useState(false);
  const [runMode, setRunMode] = useState<RunMode>("automatic");
  const [isCommandBarOpen, setIsCommandBarOpen] = useState(false);
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const shortcutActionInFlight = useRef(false);

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
  const markAsAppliedMutation = useMarkAsAppliedMutation();
  const skipJobMutation = useSkipJobMutation();
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

  const activeJobs = useFilteredJobs(
    jobs,
    activeTab,
    sourceFilter,
    sponsorFilter,
    salaryFilter,
    sort,
  );
  const counts = useMemo(() => getJobCounts(jobs), [jobs]);
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

  const openRunMode = useCallback((mode: RunMode) => {
    setRunMode(mode);
    setIsRunModeModalOpen(true);
  }, []);

  const handleManualImported = useCallback(
    async (importedJobId: string) => {
      await loadJobs();
      navigateWithContext("ready", importedJobId);
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
      } catch (error) {
        setIsPipelineRunning(false);
        setIsCancelling(false);
        const message =
          error instanceof Error ? error.message : "Failed to start pipeline";
        toast.error(message);
      }
    },
    [setIsPipelineRunning],
  );

  useEffect(() => {
    if (!pipelineTerminalEvent) return;
    setIsPipelineRunning(false);
    setIsCancelling(false);

    if (pipelineTerminalEvent.status === "cancelled") {
      toast.message("Pipeline cancelled");
      return;
    }

    if (pipelineTerminalEvent.status === "failed") {
      toast.error(pipelineTerminalEvent.errorMessage || "Pipeline failed");
      return;
    }

    toast.success("Pipeline completed");
  }, [pipelineTerminalEvent, setIsPipelineRunning]);

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
      const hasJobSpySite = compatibleSources.some(
        (source) =>
          source === "indeed" ||
          source === "linkedin" ||
          source === "glassdoor",
      );
      const hasAdzuna = compatibleSources.includes("adzuna");
      const hasHiringCafe = compatibleSources.includes("hiringcafe");
      const serializedCities = serializeCityLocationsSetting(
        values.cityLocations,
      );
      const searchCities =
        (hasJobSpySite || hasAdzuna || hasHiringCafe) && serializedCities
          ? serializedCities
          : formatCountryLabel(values.country);
      await api.updateSettings({
        searchTerms: values.searchTerms,
        jobspyResultsWanted: limits.jobspyResultsWanted,
        gradcrackerMaxJobsPerTerm: limits.gradcrackerMaxJobsPerTerm,
        ukvisajobsMaxJobs: limits.ukvisajobsMaxJobs,
        adzunaMaxJobsPerTerm: limits.adzunaMaxJobsPerTerm,
        jobspyCountryIndeed: values.country,
        searchCities,
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

  const { requestScrollToJob } = useScrollToJobItem({
    activeJobs,
    selectedJobId,
    isDesktop,
    onEnsureJobSelected: (id) => navigateWithContext(activeTab, id, true),
  });

  // ── Keyboard shortcuts ──────────────────────────────────────────────────
  const { personName } = useProfile();

  const navigateJobList = useCallback(
    (direction: 1 | -1) => {
      if (activeJobs.length === 0) return;
      const currentIndex = selectedJobId
        ? activeJobs.findIndex((j) => j.id === selectedJobId)
        : -1;
      const nextIndex = Math.max(
        0,
        Math.min(activeJobs.length - 1, currentIndex + direction),
      );
      const nextJob = activeJobs[nextIndex];
      if (nextJob && nextJob.id !== selectedJobId) {
        handleSelectJobId(nextJob.id);
        requestScrollToJob(nextJob.id);
      }
    },
    [activeJobs, selectedJobId, handleSelectJobId, requestScrollToJob],
  );

  const navigateTab = useCallback(
    (direction: 1 | -1) => {
      const currentIndex = tabs.findIndex((t) => t.id === activeTab);
      const nextIndex = (currentIndex + direction + tabs.length) % tabs.length;
      setActiveTab(tabs[nextIndex].id);
    },
    [activeTab, setActiveTab],
  );

  /**
   * After a destructive/moving action (skip, mark-applied), auto-advance to
   * the next job in the list -- mirroring handleJobMoved in JobDetailPanel.
   */
  const selectNextAfterAction = useCallback(
    (movedJobId: string) => {
      const idx = activeJobs.findIndex((j) => j.id === movedJobId);
      const next = activeJobs[idx + 1] || activeJobs[idx - 1];
      handleSelectJobId(next?.id ?? null);
    },
    [activeJobs, handleSelectJobId],
  );

  useHotkeys(
    {
      // ── Navigation ──────────────────────────────────────────────────────
      [SHORTCUTS.nextJob.key]: (e) => {
        e.preventDefault();
        navigateJobList(1);
      },
      [SHORTCUTS.nextJobArrow.key]: (e) => {
        e.preventDefault();
        navigateJobList(1);
      },
      [SHORTCUTS.prevJob.key]: (e) => {
        e.preventDefault();
        navigateJobList(-1);
      },
      [SHORTCUTS.prevJobArrow.key]: (e) => {
        e.preventDefault();
        navigateJobList(-1);
      },

      // ── Tab switching ───────────────────────────────────────────────────
      [SHORTCUTS.tabReady.key]: () => setActiveTab("ready"),
      [SHORTCUTS.tabDiscovered.key]: () => setActiveTab("discovered"),
      [SHORTCUTS.tabApplied.key]: () => setActiveTab("applied"),
      [SHORTCUTS.tabAll.key]: () => setActiveTab("all"),
      [SHORTCUTS.prevTabArrow.key]: (e) => {
        e.preventDefault();
        navigateTab(-1);
      },
      [SHORTCUTS.nextTabArrow.key]: (e) => {
        e.preventDefault();
        navigateTab(1);
      },

      // ── Context actions ─────────────────────────────────────────────────
      [SHORTCUTS.skip.key]: () => {
        if (!["discovered", "ready"].includes(activeTab)) return;
        if (shortcutActionInFlight.current) return;

        // Selection action takes precedence if selection exists
        if (selectedJobIds.size > 0) {
          void runJobAction("skip");
          return;
        }

        if (!selectedJob) return;
        shortcutActionInFlight.current = true;
        const jobId = selectedJob.id;
        skipJobMutation
          .mutateAsync(jobId)
          .then(async () => {
            toast.message("Job skipped");
            selectNextAfterAction(jobId);
            await loadJobs();
          })
          .catch((err: unknown) => {
            const msg =
              err instanceof Error ? err.message : "Failed to skip job";
            toast.error(msg);
          })
          .finally(() => {
            shortcutActionInFlight.current = false;
          });
      },

      [SHORTCUTS.markApplied.key]: () => {
        if (!selectedJob) return;
        if (activeTab !== "ready") return;
        if (shortcutActionInFlight.current) return;
        shortcutActionInFlight.current = true;
        const jobId = selectedJob.id;
        markAsAppliedMutation
          .mutateAsync(jobId)
          .then(async () => {
            toast.success("Marked as applied", {
              description: `${selectedJob.title} at ${selectedJob.employer}`,
            });
            selectNextAfterAction(jobId);
            await loadJobs();
          })
          .catch((err: unknown) => {
            const msg =
              err instanceof Error ? err.message : "Failed to mark as applied";
            toast.error(msg);
          })
          .finally(() => {
            shortcutActionInFlight.current = false;
          });
      },

      [SHORTCUTS.moveToReady.key]: () => {
        if (activeTab !== "discovered") return;
        if (shortcutActionInFlight.current) return;

        // Selection action takes precedence if selection exists
        if (selectedJobIds.size > 0) {
          void runJobAction("move_to_ready");
          return;
        }

        // Single action
        if (!selectedJob) return;

        shortcutActionInFlight.current = true;
        const jobId = selectedJob.id;
        toast.message("Moving job to Ready...");

        api
          .processJob(jobId)
          .then(async () => {
            toast.success("Job moved to Ready", {
              description: "Your tailored PDF has been generated.",
            });
            selectNextAfterAction(jobId);
            await loadJobs();
          })
          .catch((err: unknown) => {
            const msg =
              err instanceof Error
                ? err.message
                : "Failed to move job to ready";
            toast.error(msg);
          })
          .finally(() => {
            shortcutActionInFlight.current = false;
          });
      },

      [SHORTCUTS.viewPdf.key]: () => {
        if (!selectedJob) return;
        if (activeTab !== "ready") return;
        const href = `/pdfs/resume_${selectedJob.id}.pdf?v=${encodeURIComponent(selectedJob.updatedAt)}`;
        window.open(href, "_blank", "noopener,noreferrer");
      },

      [SHORTCUTS.downloadPdf.key]: () => {
        if (!selectedJob) return;
        if (activeTab !== "ready") return;
        const href = `/pdfs/resume_${selectedJob.id}.pdf?v=${encodeURIComponent(selectedJob.updatedAt)}`;
        const a = document.createElement("a");
        a.href = href;
        a.download = `${safeFilenamePart(personName || "Unknown")}_${safeFilenamePart(selectedJob.employer)}.pdf`;
        a.click();
      },

      [SHORTCUTS.openListing.key]: () => {
        if (!selectedJob) return;
        const link = selectedJob.applicationLink || selectedJob.jobUrl;
        if (link) window.open(link, "_blank", "noopener,noreferrer");
      },

      [SHORTCUTS.toggleSelect.key]: () => {
        if (!selectedJobId) return;
        toggleSelectJob(selectedJobId);
      },

      [SHORTCUTS.clearSelection.key]: () => {
        if (selectedJobIds.size > 0) clearSelection();
      },
    },
    { enabled: !isAnyModalOpen },
  );

  useHotkeys(
    {
      // ── Search ──────────────────────────────────────────────────────────
      [SHORTCUTS.searchSlash.key]: (e) => {
        e.preventDefault();
        setIsCommandBarOpen(true);
      },
    },
    { enabled: !isAnyModalOpenExcludingCommandBar },
  );

  useHotkeys(
    {
      // ── Help ────────────────────────────────────────────────────────────
      [SHORTCUTS.help.key]: (e) => {
        e.preventDefault();
        setIsHelpDialogOpen((prev) => !prev);
      },
    },
    { enabled: !isAnyModalOpenExcludingHelp },
  );

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

  useEffect(() => {
    const hasSeen = localStorage.getItem("has-seen-keyboard-shortcuts");
    if (!hasSeen) {
      setIsHelpDialogOpen(true);
    }
  }, []);

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
            counts={counts}
            onOpenCommandBar={() => setIsCommandBarOpen(true)}
            isFiltersOpen={isFiltersOpen}
            onFiltersOpenChange={setIsFiltersOpen}
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
                selectedJob={selectedJob}
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
