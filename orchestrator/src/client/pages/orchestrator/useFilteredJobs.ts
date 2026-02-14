import type { JobListItem, JobSource } from "@shared/types";
import { useMemo } from "react";
import type {
  FilterTab,
  JobSort,
  SalaryFilter,
  SponsorFilter,
} from "./constants";
import { compareJobs, parseSalaryBounds } from "./utils";

const getSponsorCategory = (score: number | null): SponsorFilter => {
  if (score == null) return "unknown";
  if (score >= 95) return "confirmed";
  if (score >= 80) return "potential";
  return "not_found";
};

export const useFilteredJobs = (
  jobs: JobListItem[],
  activeTab: FilterTab,
  sourceFilter: JobSource | "all",
  sponsorFilter: SponsorFilter,
  salaryFilter: SalaryFilter,
  sort: JobSort,
) =>
  useMemo(() => {
    let filtered = jobs.filter((job) => job.status !== "in_progress");

    if (activeTab === "ready") {
      filtered = filtered.filter((job) => job.status === "ready");
    } else if (activeTab === "discovered") {
      filtered = filtered.filter(
        (job) => job.status === "discovered" || job.status === "processing",
      );
    } else if (activeTab === "applied") {
      filtered = filtered.filter((job) => job.status === "applied");
    }

    if (activeTab !== "all") {
      filtered = filtered.filter((job) => job.closedAt == null);
    }

    if (sourceFilter !== "all") {
      filtered = filtered.filter((job) => job.source === sourceFilter);
    }

    if (sponsorFilter !== "all") {
      filtered = filtered.filter(
        (job) => getSponsorCategory(job.sponsorMatchScore) === sponsorFilter,
      );
    }

    const hasMin =
      typeof salaryFilter.min === "number" &&
      Number.isFinite(salaryFilter.min) &&
      salaryFilter.min > 0;
    const hasMax =
      typeof salaryFilter.max === "number" &&
      Number.isFinite(salaryFilter.max) &&
      salaryFilter.max > 0;

    if (
      (salaryFilter.mode === "at_least" && hasMin) ||
      (salaryFilter.mode === "at_most" && hasMax) ||
      (salaryFilter.mode === "between" && (hasMin || hasMax))
    ) {
      filtered = filtered.filter((job) => {
        const bounds = parseSalaryBounds(job);
        if (!bounds) return false;

        if (salaryFilter.mode === "at_least") {
          return hasMin ? bounds.max >= (salaryFilter.min as number) : true;
        }

        if (salaryFilter.mode === "at_most") {
          return hasMax ? bounds.min <= (salaryFilter.max as number) : true;
        }

        const min = hasMin ? (salaryFilter.min as number) : null;
        const max = hasMax ? (salaryFilter.max as number) : null;

        if (min != null && max != null) {
          return bounds.max >= min && bounds.min <= max;
        }
        if (min != null) return bounds.max >= min;
        if (max != null) return bounds.min <= max;
        return true;
      });
    }

    return [...filtered].sort((a, b) => compareJobs(a, b, sort));
  }, [jobs, activeTab, sourceFilter, sponsorFilter, salaryFilter, sort]);
