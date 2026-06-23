import type { JobListItem } from "@shared/types.js";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { type FilterTab, tabs } from "./constants";

const validTabs: FilterTab[] = ["ready", "discovered", "applied", "all"];

const commandSelectionFilterKeys = [
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
  "postedWithin",
  "employment",
  "location",
];

interface UseOrchestratorNavigationArgs {
  searchParams: URLSearchParams;
}

export function useOrchestratorNavigation({
  searchParams,
}: UseOrchestratorNavigationArgs) {
  const { tab, jobId } = useParams<{ tab: string; jobId?: string }>();
  const navigate = useNavigate();
  const activeTab = useMemo(() => {
    if (tab && validTabs.includes(tab as FilterTab)) {
      return tab as FilterTab;
    }
    return "ready";
  }, [tab]);

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

  useEffect(() => {
    if (tab === "in_progress") {
      navigate("/applications/in-progress", { replace: true });
      return;
    }
    if (tab && !validTabs.includes(tab as FilterTab)) {
      navigateWithContext("ready", null, true);
    }
  }, [tab, navigate, navigateWithContext]);

  const handleSelectJobId = useCallback(
    (id: string | null) => {
      navigateWithContext(activeTab, id);
    },
    [activeTab, navigateWithContext],
  );

  const setActiveTab = useCallback(
    (newTab: FilterTab, jobs: JobListItem[]) => {
      const tabDef = tabs.find((item) => item.id === newTab);
      const selectedItem = selectedJobId
        ? jobs.find((job) => job.id === selectedJobId)
        : null;
      const jobFitsTab =
        selectedItem &&
        (tabDef?.statuses.length === 0 ||
          tabDef?.statuses.includes(selectedItem.status));

      navigateWithContext(newTab, jobFitsTab ? selectedJobId : null);
    },
    [navigateWithContext, selectedJobId],
  );

  const navigateToCommandJob = useCallback(
    (targetTab: FilterTab, id: string) => {
      const nextParams = new URLSearchParams(searchParams);
      for (const key of commandSelectionFilterKeys) {
        nextParams.delete(key);
      }
      const query = nextParams.toString();
      navigate(`/jobs/${targetTab}/${id}${query ? `?${query}` : ""}`);
    },
    [navigate, searchParams],
  );

  return {
    activeTab,
    selectedJobId,
    navigateWithContext,
    handleSelectJobId,
    setActiveTab,
    navigateToCommandJob,
  };
}

export function useNavigationRefresh(onRefreshJobs: () => Promise<void>) {
  const location = useLocation();
  const lastNavigationRefreshRef = useRef<number | null>(null);

  useEffect(() => {
    const state = location.state as { refreshJobsAt?: number } | null;
    const refreshJobsAt = state?.refreshJobsAt;
    if (!refreshJobsAt || refreshJobsAt === lastNavigationRefreshRef.current) {
      return;
    }
    lastNavigationRefreshRef.current = refreshJobsAt;
    void onRefreshJobs();
  }, [location.state, onRefreshJobs]);
}
