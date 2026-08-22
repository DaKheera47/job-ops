import { getPostingDateSortValue } from "@client/lib/job-posting-age";
import { EXTRACTOR_SOURCE_METADATA } from "@shared/extractors";
import type { AppSettings, JobListItem, JobSource } from "@shared/types";
import type {
  DateFilterDimension,
  EmploymentType,
  FilterTab,
  JobSort,
} from "./constants";
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
    case "datePosted": {
      const aDate = getPostingDateSortValue(a.datePosted);
      const bDate = getPostingDateSortValue(b.datePosted);
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

export const getJobDateValue = (
  job: JobListItem,
  dimension: DateFilterDimension,
): number | null => {
  switch (dimension) {
    case "ready":
      return dateValue(job.readyAt);
    case "applied":
      return dateValue(job.appliedAt);
    case "closed":
      return typeof job.closedAt === "number" ? job.closedAt * 1000 : null;
    case "discovered":
      return dateValue(job.discoveredAt);
  }
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

/**
 * Lowercase a string and collapse anything that is not alphanumeric into a
 * single space, so messy free-text values (e.g. "London, UK") tokenize
 * consistently for matching.
 */
const normalizeText = (value: string): string =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Map a free-text employment-type string (e.g. "Full-time", "fulltime",
 * "Contract / Temp") onto canonical {@link EmploymentType} buckets. A single
 * string may yield multiple types, so the result is a set.
 */
export const extractEmploymentTypes = (
  raw: string | null | undefined,
): Set<EmploymentType> => {
  const types = new Set<EmploymentType>();
  if (!raw) return types;

  const value = raw.toLowerCase();
  if (/intern|placement|trainee|graduate scheme/.test(value)) {
    types.add("internship");
  }
  if (/part[\s_-]?time/.test(value)) types.add("part_time");
  if (/contract|freelance|fixed[\s_-]?term/.test(value)) {
    types.add("contract");
  }
  if (/temp|seasonal/.test(value)) types.add("temporary");
  if (/full[\s_-]?time|permanent|\bperm\b/.test(value)) {
    types.add("full_time");
  }
  return types;
};

/**
 * True when the job matches at least one of the selected employment types.
 * When the job has no recognizable type it is excluded while the filter is
 * active (an unknown type cannot be confirmed to match the user's choice).
 */
export const matchesEmploymentType = (
  job: JobListItem,
  selected: EmploymentType[],
): boolean => {
  if (selected.length === 0) return true;
  const jobTypes = extractEmploymentTypes(job.jobType);
  if (jobTypes.size === 0) return false;
  return selected.some((type) => jobTypes.has(type));
};

/**
 * True when every token of the location query appears in the job's location
 * (order-independent), so "london uk" matches "London, UK". Jobs with no
 * location are excluded while the filter is active.
 */
export const matchesLocation = (job: JobListItem, query: string): boolean => {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return true;
  const haystack = normalizeText(job.location ?? "");
  if (!haystack) return false;
  return normalizedQuery.split(" ").every((token) => haystack.includes(token));
};

/**
 * True when the job was posted within the last `days` days. `datePosted` is
 * free text (ISO date or relative phrase like "3 days ago"), so it is coerced
 * via {@link getPostingDateSortValue}. Jobs with an unparseable/missing posting
 * date are excluded while the filter is active.
 */
export const matchesPostedWithin = (
  job: JobListItem,
  days: number | null,
  now: number,
): boolean => {
  if (days == null) return true;
  const posted = getPostingDateSortValue(job.datePosted, new Date(now));
  if (posted == null) return false;
  return posted >= now - days * 86_400_000;
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
    if (job.status === "ready" || job.status === "processing") byTab.ready += 1;
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
  if (!settings) return [...orderedSources];

  const enabled: JobSource[] = [];
  const hasUkVisaJobsAuth = Boolean(
    settings.ukvisajobsEmail?.trim() && settings.ukvisajobsPasswordHint,
  );
  const hasAdzunaAuth = Boolean(
    settings.adzunaAppId?.trim() && settings.adzunaAppKeyHint,
  );
  const hasApifyToken = Boolean(settings.apifyTokenHint);

  for (const source of orderedSources) {
    if (
      !EXTRACTOR_SOURCE_METADATA[source].requiresCredentials ||
      (source === "ukvisajobs" && hasUkVisaJobsAuth) ||
      (source === "adzuna" && hasAdzunaAuth) ||
      (source === "seek" && hasApifyToken)
    ) {
      enabled.push(source);
    }
  }

  return enabled.length > 0 ? enabled : [...DEFAULT_PIPELINE_SOURCES];
};
