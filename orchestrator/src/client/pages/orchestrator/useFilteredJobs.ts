import type { Job, JobSource } from "@shared/types";
import { useMemo } from "react";
import type { FilterTab, JobSort, SponsorFilter } from "./constants";
import { compareJobs, jobMatchesQuery } from "./utils";

const getSponsorCategory = (score: number | null): SponsorFilter => {
  if (score == null) return "unknown";
  if (score >= 95) return "confirmed";
  if (score >= 80) return "potential";
  return "not_found";
};

const parseSalaryFloor = (job: Job): number | null => {
  if (
    typeof job.salaryMinAmount === "number" &&
    Number.isFinite(job.salaryMinAmount)
  ) {
    return job.salaryMinAmount;
  }
  if (
    typeof job.salaryMaxAmount === "number" &&
    Number.isFinite(job.salaryMaxAmount)
  ) {
    return job.salaryMaxAmount;
  }
  if (!job.salary) return null;

  const normalized = job.salary.toLowerCase().replace(/,/g, "");
  const values: number[] = [];

  const kPattern = /(\d+(?:\.\d+)?)\s*k\b/g;
  for (const match of normalized.matchAll(kPattern)) {
    values.push(Math.round(Number.parseFloat(match[1]) * 1000));
  }

  const plainPattern = /(\d{4,6}(?:\.\d+)?)/g;
  for (const match of normalized.matchAll(plainPattern)) {
    values.push(Math.round(Number.parseFloat(match[1])));
  }

  if (values.length === 0) return null;
  return Math.min(...values);
};

export const useFilteredJobs = (
  jobs: Job[],
  activeTab: FilterTab,
  sourceFilter: JobSource | "all",
  sponsorFilter: SponsorFilter,
  minSalary: number | null,
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

    if (sponsorFilter !== "all") {
      filtered = filtered.filter(
        (job) => getSponsorCategory(job.sponsorMatchScore) === sponsorFilter,
      );
    }

    if (
      typeof minSalary === "number" &&
      Number.isFinite(minSalary) &&
      minSalary > 0
    ) {
      filtered = filtered.filter((job) => {
        const salaryFloor = parseSalaryFloor(job);
        return salaryFloor != null && salaryFloor >= minSalary;
      });
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter((job) => jobMatchesQuery(job, searchQuery));
    }

    return [...filtered].sort((a, b) => compareJobs(a, b, sort));
  }, [
    jobs,
    activeTab,
    sourceFilter,
    sponsorFilter,
    minSalary,
    searchQuery,
    sort,
  ]);
