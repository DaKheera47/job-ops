/**
 * Orchestrator layout with a split list/detail experience.
 */

import { useSettings } from "@client/hooks/useSettings";
import type { BulkJobAction, JobSource } from "@shared/types.js";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent } from "@/components/ui/drawer";
import * as api from "../api";
import { ManualImportSheet } from "../components";
import type { FilterTab, JobSort } from "./orchestrator/constants";
import { DEFAULT_SORT } from "./orchestrator/constants";
import { JobDetailPanel } from "./orchestrator/JobDetailPanel";
import { JobListPanel } from "./orchestrator/JobListPanel";
import { OrchestratorFilters } from "./orchestrator/OrchestratorFilters";
import { OrchestratorHeader } from "./orchestrator/OrchestratorHeader";
import { OrchestratorSummary } from "./orchestrator/OrchestratorSummary";
import {
  canBulkMoveToReady,
  canBulkSkip,
  getFailedJobIds,
} from "./orchestrator/bulkActions";
import { useFilteredJobs } from "./orchestrator/useFilteredJobs";
import { useOrchestratorData } from "./orchestrator/useOrchestratorData";
import { usePipelineSources } from "./orchestrator/usePipelineSources";
import {
  getEnabledSources,
  getJobCounts,
  getSourcesWithJobs,
} from "./orchestrator/utils";

export const OrchestratorPage: React.FC = () => {
  const { tab, jobId } = useParams<{ tab: string; jobId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

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

  // Sync searchQuery with URL
  const searchQuery = searchParams.get("q") || "";
  const setSearchQuery = useCallback(
    (q: string) => {
      setSearchParams(
        (prev) => {
          if (q) prev.set("q", q);
          else prev.delete("q");
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Sync sourceFilter with URL
  const sourceFilter =
    (searchParams.get("source") as JobSource | "all") || "all";
  const setSourceFilter = useCallback(
    (source: JobSource | "all") => {
      setSearchParams(
        (prev) => {
          if (source !== "all") prev.set("source", source);
          else prev.delete("source");
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Sync sort with URL
  const sort = useMemo((): JobSort => {
    const s = searchParams.get("sort");
    if (!s) return DEFAULT_SORT;
    const [key, direction] = s.split("-");
    return {
      key: key as JobSort["key"],
      direction: direction as JobSort["direction"],
    };
  }, [searchParams]);

  const setSort = useCallback(
    (newSort: JobSort) => {
      setSearchParams(
        (prev) => {
          if (
            newSort.key === DEFAULT_SORT.key &&
            newSort.direction === DEFAULT_SORT.direction
          ) {
            prev.delete("sort");
          } else {
            prev.set("sort", `${newSort.key}-${newSort.direction}`);
          }
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  // Effect to sync URL if it was invalid
  useEffect(() => {
    const validTabs: FilterTab[] = ["ready", "discovered", "applied", "all"];
    if (tab && !validTabs.includes(tab as FilterTab)) {
      navigateWithContext("ready", null, true);
    }
  }, [tab, navigateWithContext]);

  const [navOpen, setNavOpen] = useState(false);
  const [isManualImportOpen, setIsManualImportOpen] = useState(false);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [bulkActionInFlight, setBulkActionInFlight] = useState<null | BulkJobAction>(null);
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

  const { settings } = useSettings();
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
  const selectedJobs = useMemo(
    () => activeJobs.filter((job) => selectedJobIds.has(job.id)),
    [activeJobs, selectedJobIds],
  );
  const canSkipSelected = useMemo(
    () => canBulkSkip(selectedJobs),
    [selectedJobs],
  );
  const canMoveSelected = useMemo(
    () => canBulkMoveToReady(selectedJobs),
    [selectedJobs],
  );
  const bulkActionHint = useMemo(() => {
    if (selectedJobs.length === 0) return null;
    if (!canMoveSelected && !canSkipSelected) {
      return "Selected jobs are not eligible for bulk actions.";
    }
    if (!canMoveSelected) {
      return "Move to Ready only works for discovered jobs.";
    }
    if (!canSkipSelected) {
      return "Skip only works for discovered or ready jobs.";
    }
    return null;
  }, [selectedJobs, canMoveSelected, canSkipSelected]);

  useEffect(() => {
    if (isLoading || sourceFilter === "all") return;
    if (!sourcesWithJobs.includes(sourceFilter)) {
      setSourceFilter("all");
    }
  }, [isLoading, sourceFilter, setSourceFilter, sourcesWithJobs]);

  useEffect(() => {
    setSelectedJobIds(new Set());
  }, [activeTab]);

  useEffect(() => {
    const activeJobIdSet = new Set(activeJobs.map((job) => job.id));
    setSelectedJobIds((previous) => {
      if (previous.size === 0) return previous;
      const next = new Set(
        Array.from(previous).filter((jobId) => activeJobIdSet.has(jobId)),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [activeJobs]);

  const handleManualImported = useCallback(
    async (importedJobId: string) => {
      // Refresh jobs and navigate to the new job in discovered tab
      await loadJobs();
      navigateWithContext("discovered", importedJobId);
    },
    [loadJobs, navigateWithContext],
  );

  const handleRunPipeline = async () => {
    try {
      setIsPipelineRunning(true);
      await api.runPipeline({ sources: pipelineSources });
      toast.message("Pipeline started", {
        description: `Sources: ${pipelineSources.join(", ")}. This may take a few minutes.`,
      });

      const pollInterval = setInterval(async () => {
        try {
          const status = await api.getPipelineStatus();
          if (!status.isRunning) {
            clearInterval(pollInterval);
            setIsPipelineRunning(false);
            await loadJobs();
            toast.success("Pipeline completed");
          }
        } catch {
          // Ignore errors
        }
      }, 5000);
    } catch (error) {
      setIsPipelineRunning(false);
      const message =
        error instanceof Error ? error.message : "Failed to start pipeline";
      toast.error(message);
    }
  };

  const handleSelectJob = (id: string) => {
    handleSelectJobId(id);
    if (!isDesktop) {
      setIsDetailDrawerOpen(true);
    }
  };

  const handleToggleSelectJob = useCallback((jobId: string) => {
    setSelectedJobIds((previous) => {
      const next = new Set(previous);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedJobIds(() =>
        checked ? new Set(activeJobs.map((job) => job.id)) : new Set(),
      );
    },
    [activeJobs],
  );

  const handleBulkAction = useCallback(
    async (action: BulkJobAction) => {
      if (selectedJobIds.size === 0) return;
      try {
        setBulkActionInFlight(action);
        const result = await api.bulkJobAction({
          action,
          jobIds: Array.from(selectedJobIds),
        });
        const failedIds = getFailedJobIds(result);
        const successLabel =
          action === "skip" ? "jobs skipped" : "jobs moved to Ready";
        if (result.failed === 0) {
          toast.success(`${result.succeeded} ${successLabel}`);
        } else {
          toast.error(
            `${result.succeeded} succeeded, ${result.failed} failed.`,
          );
        }
        await loadJobs();
        setSelectedJobIds(failedIds);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to run bulk action";
        toast.error(message);
      } finally {
        setBulkActionInFlight(null);
      }
    },
    [selectedJobIds, loadJobs],
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
        pipelineSources={pipelineSources}
        enabledSources={enabledSources}
        onToggleSource={toggleSource}
        onSetPipelineSources={setPipelineSources}
        onRunPipeline={handleRunPipeline}
        onOpenManualImport={() => setIsManualImportOpen(true)}
      />

      <main className="container mx-auto max-w-7xl space-y-6 px-4 py-6 pb-12">
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
            sourcesWithJobs={sourcesWithJobs}
            sort={sort}
            onSortChange={setSort}
          />

          {/* List/Detail grid - directly under tabs, no extra section */}
          {selectedJobIds.size > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
              <div className="text-xs text-muted-foreground tabular-nums">
                {selectedJobIds.size} selected
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canMoveSelected || bulkActionInFlight !== null}
                onClick={() => void handleBulkAction("move_to_ready")}
              >
                Move to Ready
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!canSkipSelected || bulkActionInFlight !== null}
                onClick={() => void handleBulkAction("skip")}
              >
                Skip selected
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setSelectedJobIds(new Set())}
                disabled={bulkActionInFlight !== null}
              >
                Clear
              </Button>
              {bulkActionHint && (
                <div className="text-xs text-muted-foreground">
                  {bulkActionHint}
                </div>
              )}
            </div>
          )}

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
              onToggleSelectJob={handleToggleSelectJob}
              onToggleSelectAll={handleToggleSelectAll}
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

      <ManualImportSheet
        open={isManualImportOpen}
        onOpenChange={setIsManualImportOpen}
        onImported={handleManualImported}
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
