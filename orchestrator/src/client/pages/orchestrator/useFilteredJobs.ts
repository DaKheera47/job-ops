import { useMemo } from "react";

import type { Job, JobSource } from "../../../shared/types";
import type { FilterTab, JobSort } from "./constants";
import { compareJobs, jobMatchesQuery } from "./utils";

export const useFilteredJobs = (
  jobs: Job[],
  activeTab: FilterTab,
  sourceFilter: JobSource | "all",
  searchQuery: string,
  sort: JobSort,
) =>
  useMemo(() => {
    let filtered = jobs;

    if (activeTab === "ready") {
      filtered = filtered.filter((job) => job.status === "ready");
    } else if (activeTab === "discovered") {
      filtered = filtered.filter(
        (job) => job.status === "discovered" || job.status === "processing",
      );
    } else if (activeTab === "applied") {
      filtered = filtered.filter((job) => job.status === "applied");
    }

    if (sourceFilter !== "all") {
      filtered = filtered.filter((job) => job.source === sourceFilter);
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter((job) => jobMatchesQuery(job, searchQuery));
    }

    return [...filtered].sort((a, b) => compareJobs(a, b, sort));
  }, [jobs, activeTab, sourceFilter, searchQuery, sort]);
