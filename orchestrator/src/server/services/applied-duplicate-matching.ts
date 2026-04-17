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

type PreparedMatchableJob = MatchableJob & {
  normalizedTitle: string;
  normalizedEmployer: string;
  discoveredAtMs: number | null;
  appliedAtMs: number | null;
};

export function isHistoricalAppliedJob(
  job: Pick<Job, "status" | "appliedAt">,
): boolean {
  return HISTORICAL_JOB_STATUSES.has(job.status) && Boolean(job.appliedAt);
}

function prepareMatchableJob(job: MatchableJob): PreparedMatchableJob {
  const discoveredAtMs = Date.parse(job.discoveredAt);
  const appliedAtMs = job.appliedAt ? Date.parse(job.appliedAt) : null;

  return {
    ...job,
    normalizedTitle: normalizeJobTitle(job.title),
    normalizedEmployer: normalizeCompanyName(job.employer),
    discoveredAtMs: Number.isFinite(discoveredAtMs) ? discoveredAtMs : null,
    appliedAtMs:
      appliedAtMs !== null && Number.isFinite(appliedAtMs) ? appliedAtMs : null,
  };
}

function isWithinDuplicateWindow(
  job: PreparedMatchableJob,
  candidate: PreparedMatchableJob,
) {
  if (job.discoveredAtMs === null || candidate.appliedAtMs === null) {
    return false;
  }

  const ageMs = job.discoveredAtMs - candidate.appliedAtMs;
  return ageMs >= 0 && ageMs <= APPLIED_DUPLICATE_WINDOW_MS;
}

function findAppliedDuplicateMatchFromPreparedJobs(
  job: PreparedMatchableJob,
  candidates: PreparedMatchableJob[],
): AppliedDuplicateMatch | null {
  if (!job.normalizedTitle || !job.normalizedEmployer) {
    return null;
  }

  let bestMatch: AppliedDuplicateMatch | null = null;
  let bestAppliedAtMs = 0;

  for (const candidate of candidates) {
    if (candidate.id === job.id || !isHistoricalAppliedJob(candidate)) {
      continue;
    }

    if (!candidate.normalizedTitle || !candidate.normalizedEmployer) {
      continue;
    }

    if (!isWithinDuplicateWindow(job, candidate)) {
      continue;
    }

    const titleScore = calculateSimilarity(
      job.normalizedTitle,
      candidate.normalizedTitle,
    );
    const employerScore = calculateSimilarity(
      job.normalizedEmployer,
      candidate.normalizedEmployer,
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

    const currentAppliedAt = candidate.appliedAtMs ?? 0;

    if (
      !bestMatch ||
      candidateMatch.score > bestMatch.score ||
      (candidateMatch.score === bestMatch.score &&
        currentAppliedAt > bestAppliedAtMs)
    ) {
      bestMatch = candidateMatch;
      bestAppliedAtMs = currentAppliedAt;
    }
  }

  return bestMatch;
}

export function findAppliedDuplicateMatch(
  job: MatchableJob,
  candidates: MatchableJob[],
): AppliedDuplicateMatch | null {
  if (isHistoricalAppliedJob(job)) {
    return null;
  }

  const preparedJob = prepareMatchableJob(job);
  if (!preparedJob.normalizedTitle || !preparedJob.normalizedEmployer) {
    return null;
  }

  return findAppliedDuplicateMatchFromPreparedJobs(
    preparedJob,
    candidates.map(prepareMatchableJob),
  );
}

export function attachAppliedDuplicateMatches<T extends Job | JobListItem>(
  jobs: T[],
  candidates: MatchableJob[],
): T[] {
  const preparedCandidates = candidates.map(prepareMatchableJob);

  return jobs.map((job) => {
    if (isHistoricalAppliedJob(job)) {
      return {
        ...job,
        appliedDuplicateMatch: null,
      };
    }

    const preparedJob = prepareMatchableJob(job);

    return {
      ...job,
      appliedDuplicateMatch: findAppliedDuplicateMatchFromPreparedJobs(
        preparedJob,
        preparedCandidates,
      ),
    };
  });
}
