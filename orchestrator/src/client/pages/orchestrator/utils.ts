import type { AppSettings, Job, JobSource } from "../../../shared/types";
import type { FilterTab, JobSort } from "./constants";
import { orderedFilterSources, orderedSources } from "./constants";

const dateValue = (value: string | null) => {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const compareString = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" });
const compareNumber = (a: number, b: number) => a - b;

export const compareJobs = (a: Job, b: Job, sort: JobSort) => {
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

export const jobMatchesQuery = (job: Job, query: string) => {
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

export const getJobCounts = (jobs: Job[]): Record<FilterTab, number> => {
  const byTab: Record<FilterTab, number> = {
    ready: 0,
    discovered: 0,
    applied: 0,
    all: jobs.length,
  };

  for (const job of jobs) {
    if (job.status === "ready") byTab.ready += 1;
    if (job.status === "applied") byTab.applied += 1;
    if (job.status === "discovered" || job.status === "processing")
      byTab.discovered += 1;
  }

  return byTab;
};

export const getSourcesWithJobs = (jobs: Job[]): JobSource[] => {
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
  const jobspySites = settings.jobspySites ?? [];
  const hasUkVisaJobsAuth = Boolean(
    settings.ukvisajobsEmail?.trim() && settings.ukvisajobsPasswordHint,
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
    if (source === "indeed" || source === "linkedin") {
      if (jobspySites.includes(source)) enabled.push(source);
    }
  }

  return enabled.length > 0 ? enabled : [...orderedSources];
};
