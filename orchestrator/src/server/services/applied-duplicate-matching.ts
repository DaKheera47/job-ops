import {
  calculateSimilarity,
  normalizeCompanyName,
  normalizeJobTitle,
} from "@shared/job-matching";
import type {
  AppliedDuplicateMatch,
  Job,
  JobListItem,
  JobStatus,
} from "@shared/types";

const APPLIED_DUPLICATE_THRESHOLD = 90;
const APPLIED_DUPLICATE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORICAL_JOB_STATUSES: ReadonlySet<JobStatus> = new Set([
  "applied",
  "in_progress",
]);

type MatchableJob = Pick<
  Job,
  "id" | "title" | "employer" | "status" | "appliedAt" | "discoveredAt"
>;

export function isHistoricalAppliedJob(
  job: Pick<Job, "status" | "appliedAt">,
): boolean {
  return HISTORICAL_JOB_STATUSES.has(job.status) && Boolean(job.appliedAt);
}

function isWithinDuplicateWindow(job: MatchableJob, candidate: MatchableJob) {
  const discoveredAt = Date.parse(job.discoveredAt);
  const appliedAt = Date.parse(candidate.appliedAt as string);

  if (!Number.isFinite(discoveredAt) || !Number.isFinite(appliedAt)) {
    return false;
  }

  const ageMs = discoveredAt - appliedAt;
  return ageMs >= 0 && ageMs <= APPLIED_DUPLICATE_WINDOW_MS;
}

export function findAppliedDuplicateMatch(
  job: MatchableJob,
  candidates: MatchableJob[],
): AppliedDuplicateMatch | null {
  if (isHistoricalAppliedJob(job)) {
    return null;
  }

  const normalizedTitle = normalizeJobTitle(job.title);
  const normalizedEmployer = normalizeCompanyName(job.employer);
  if (!normalizedTitle || !normalizedEmployer) {
    return null;
  }

  let bestMatch: AppliedDuplicateMatch | null = null;

  for (const candidate of candidates) {
    if (!isHistoricalAppliedJob(candidate) || candidate.id === job.id) {
      continue;
    }

    if (!isWithinDuplicateWindow(job, candidate)) {
      continue;
    }

    const titleScore = calculateSimilarity(
      normalizedTitle,
      normalizeJobTitle(candidate.title),
    );
    const employerScore = calculateSimilarity(
      normalizedEmployer,
      normalizeCompanyName(candidate.employer),
    );

    if (
      titleScore <= APPLIED_DUPLICATE_THRESHOLD ||
      employerScore <= APPLIED_DUPLICATE_THRESHOLD
    ) {
      continue;
    }

    const score = Math.round((titleScore + employerScore) / 2);
    const candidateMatch: AppliedDuplicateMatch = {
      jobId: candidate.id,
      title: candidate.title,
      employer: candidate.employer,
      appliedAt: candidate.appliedAt as string,
      score,
      titleScore,
      employerScore,
    };

    const currentAppliedAt = Date.parse(candidateMatch.appliedAt);
    const bestAppliedAt = bestMatch ? Date.parse(bestMatch.appliedAt) : 0;

    if (
      !bestMatch ||
      candidateMatch.score > bestMatch.score ||
      (candidateMatch.score === bestMatch.score &&
        currentAppliedAt > bestAppliedAt)
    ) {
      bestMatch = candidateMatch;
    }
  }

  return bestMatch;
}

export function attachAppliedDuplicateMatches<T extends Job | JobListItem>(
  jobs: T[],
  candidates: MatchableJob[],
): T[] {
  return jobs.map((job) => ({
    ...job,
    appliedDuplicateMatch: findAppliedDuplicateMatch(job, candidates),
  }));
}
