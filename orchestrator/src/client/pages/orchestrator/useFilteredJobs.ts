import type { JobListItem } from "@shared/types";
import { useMemo } from "react";
import type {
  DateFilterDimension,
  JobDateFilter,
  JobFilters,
  SponsorFilter,
} from "./constants";
import {
  compareJobs,
  getJobDateValue,
  matchesEmploymentType,
  matchesLocation,
  matchesPostedWithin,
  parseSalaryBounds,
} from "./utils";

const getSponsorCategory = (score: number | null): SponsorFilter => {
  if (score == null) return "unknown";
  if (score >= 95) return "confirmed";
  if (score >= 80) return "potential";
  return "not_found";
};

export const useFilteredJobs = (jobs: JobListItem[], filters: JobFilters) => {
  const {
    activeTab,
    dateFilter,
    sourceFilter,
    sponsorFilter,
    salaryFilter,
    scoreFilter,
    postedWithinDays,
    employmentTypes,
    location,
    sort,
  } = filters;

  return useMemo(() => {
    let filtered = [...jobs];

    if (activeTab === "ready") {
      filtered = filtered.filter(
        (job) => job.status === "ready" || job.status === "processing",
      );
    } else if (activeTab === "discovered") {
      filtered = filtered.filter(
        (job) => job.status === "discovered" || job.status === "processing",
      );
    } else if (activeTab === "applied") {
      filtered = filtered.filter((job) => job.status === "applied");
    } else if (activeTab === "all") {
      const includeClosedJobs = dateFilter.dimensions.includes("closed");
      if (!includeClosedJobs) {
        filtered = filtered.filter((job) => job.closedAt == null);
      }
    }

    if (dateFilter.dimensions.length > 0) {
      filtered = filtered.filter((job) =>
        dateFilter.dimensions.some((dimension) =>
          matchesDateDimension(job, dimension, dateFilter),
        ),
      );
    }

    if (sourceFilter !== "all") {
      filtered = filtered.filter((job) => job.source === sourceFilter);
    }

    if (postedWithinDays != null) {
      const now = Date.now();
      filtered = filtered.filter((job) =>
        matchesPostedWithin(job, postedWithinDays, now),
      );
    }

    if (employmentTypes.length > 0) {
      filtered = filtered.filter((job) =>
        matchesEmploymentType(job, employmentTypes),
      );
    }

    if (location.trim()) {
      filtered = filtered.filter((job) => matchesLocation(job, location));
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

    if (scoreFilter.mode === "missing") {
      filtered = filtered.filter((job) => job.suitabilityScore == null);
    } else if (scoreFilter.mode === "has") {
      filtered = filtered.filter((job) => {
        if (job.suitabilityScore == null) return false;
        if (scoreFilter.min != null && job.suitabilityScore < scoreFilter.min) {
          return false;
        }
        if (scoreFilter.max != null && job.suitabilityScore > scoreFilter.max) {
          return false;
        }
        return true;
      });
    }

    return [...filtered].sort((a, b) => compareJobs(a, b, sort));
  }, [
    jobs,
    activeTab,
    dateFilter,
    sourceFilter,
    sponsorFilter,
    salaryFilter,
    scoreFilter,
    postedWithinDays,
    employmentTypes,
    location,
    sort,
  ]);
};

const matchesDateDimension = (
  job: JobListItem,
  dimension: DateFilterDimension,
  filter: JobDateFilter,
): boolean => {
  const value = getJobDateValue(job, dimension);
  if (value == null) return false;

  const localDate = toLocalDateKey(value);
  if (!localDate) return false;

  if (filter.startDate && localDate < filter.startDate) return false;
  if (filter.endDate && localDate > filter.endDate) return false;
  return true;
};

const toLocalDateKey = (value: number): string | null => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};
