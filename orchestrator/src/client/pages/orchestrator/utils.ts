import type { AppSettings, JobListItem, JobSource } from "@shared/types";
import type { FilterTab, JobSort } from "./constants";
import {
  DEFAULT_PIPELINE_SOURCES,
  orderedFilterSources,
  orderedSources,
} from "./constants";

const dateValue = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const compareString = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" });
const compareNumber = (a: number, b: number) => a - b;

export const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const parseSalaryBounds = (
  job: JobListItem,
): { min: number; max: number } | null => {
  if (
    typeof job.salaryMinAmount === "number" &&
    Number.isFinite(job.salaryMinAmount)
  ) {
    if (
      typeof job.salaryMaxAmount === "number" &&
      Number.isFinite(job.salaryMaxAmount)
    ) {
      return { min: job.salaryMinAmount, max: job.salaryMaxAmount };
    }
    return { min: job.salaryMinAmount, max: job.salaryMinAmount };
  }
  if (
    typeof job.salaryMaxAmount === "number" &&
    Number.isFinite(job.salaryMaxAmount)
  ) {
    return { min: job.salaryMaxAmount, max: job.salaryMaxAmount };
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
  return { min: Math.min(...values), max: Math.max(...values) };
};

export const compareJobs = (a: JobListItem, b: JobListItem, sort: JobSort) => {
  let value = 0;

  switch (sort.key) {
    case "title":
      value = compareString(a.title, b.title);
      break;
    case "employer":
      value = compareString(a.employer, b.employer);
      break;
    case "score": {
      const aScore = a.suitabilityScore;
      const bScore = b.suitabilityScore;

      if (aScore == null && bScore == null) {
        value = 0;
        break;
      }
      if (aScore == null) return 1;
      if (bScore == null) return -1;
      value = compareNumber(aScore, bScore);
      break;
    }
    case "salary": {
      const aSalary = parseSalaryBounds(a);
      const bSalary = parseSalaryBounds(b);
      if (aSalary == null && bSalary == null) {
        value = 0;
        break;
      }
      if (aSalary == null) return 1;
      if (bSalary == null) return -1;
      value = compareNumber(aSalary.max, bSalary.max);
      if (value === 0) {
        value = compareNumber(aSalary.min, bSalary.min);
      }
      break;
    }
    case "discoveredAt": {
      const aDate = dateValue(a.discoveredAt);
      const bDate = dateValue(b.discoveredAt);
      if (aDate == null && bDate == null) {
        value = 0;
        break;
      }
      if (aDate == null) return 1;
      if (bDate == null) return -1;
      value = compareNumber(aDate, bDate);
      break;
    }
    default:
      value = 0;
  }

  if (value !== 0) return sort.direction === "asc" ? value : -value;
  return a.id.localeCompare(b.id);
};

export const jobMatchesQuery = (job: JobListItem, query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    job.title,
    job.employer,
    job.location,
    job.source,
    job.status,
    job.jobType,
    job.jobFunction,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(normalized);
};

export const getJobCounts = (
  jobs: JobListItem[],
): Record<FilterTab, number> => {
  const byTab: Record<FilterTab, number> = {
    ready: 0,
    discovered: 0,
    applied: 0,
    all: jobs.length,
  };

  for (const job of jobs) {
    if (job.closedAt != null) continue;
    if (job.status === "in_progress") continue;
    if (job.status === "ready") byTab.ready += 1;
    if (job.status === "applied") byTab.applied += 1;
    if (job.status === "discovered" || job.status === "processing")
      byTab.discovered += 1;
  }

  return byTab;
};

export const getSourcesWithJobs = (jobs: JobListItem[]): JobSource[] => {
  const seen = new Set<JobSource>();
  for (const job of jobs) {
    seen.add(job.source);
  }
  return orderedFilterSources.filter((source) => seen.has(source));
};

export const getEnabledSources = (
  settings: AppSettings | null,
): JobSource[] => {
  if (!settings) return [...DEFAULT_PIPELINE_SOURCES, "glassdoor"];

  const enabled: JobSource[] = [];
  const hasUkVisaJobsAuth = Boolean(
    settings.ukvisajobsEmail?.trim() && settings.ukvisajobsPasswordHint,
  );
  const hasAdzunaAuth = Boolean(
    settings.adzunaAppId?.trim() && settings.adzunaAppKeyHint,
  );

  for (const source of orderedSources) {
    if (source === "gradcracker") {
      enabled.push(source);
      continue;
    }
    if (source === "ukvisajobs") {
      if (hasUkVisaJobsAuth) enabled.push(source);
      continue;
    }
    if (source === "adzuna") {
      if (hasAdzunaAuth) enabled.push(source);
      continue;
    }
    if (
      source === "indeed" ||
      source === "linkedin" ||
      source === "glassdoor"
    ) {
      enabled.push(source);
    }
  }

  return enabled.length > 0 ? enabled : [...DEFAULT_PIPELINE_SOURCES];
};
