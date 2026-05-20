import { matchJobLocationIntent } from "@shared/job-matching.js";
import type { LocationIntent } from "@shared/location-intelligence.js";
import { normalizeCountryKey } from "@shared/location-support.js";
import type { JobListItem, WatchlistJobResult } from "@shared/types.js";
import { computeJobMatchScore } from "../orchestrator/JobCommandBar.utils";
import type { RankedWatchlistJob, SourceSelectionDraft } from "./types";

export const CUSTOM_SOURCE_VALUE = "__custom__";
export const WATCHLIST_SOURCE_COUNT_OPTIONS = [0, 1, 2, 3, 4, 5] as const;

let sourceDraftSequence = 0;

export function createSourceDraft(
  overrides?: Partial<Omit<SourceSelectionDraft, "id">>,
): SourceSelectionDraft {
  sourceDraftSequence += 1;
  return {
    id: `draft-${sourceDraftSequence}`,
    isCustom: false,
    sourceType: "workday",
    catalogSourceId: null,
    customUrl: "",
    ...overrides,
  };
}

export function getEmployerFromCareersUrl(careersUrl: string): string {
  try {
    const host = new URL(careersUrl).hostname;
    const [tenant] = host.split(".");
    return tenant || host;
  } catch {
    return "Careers";
  }
}

export function toJobListItem(job: WatchlistJobResult): JobListItem {
  const now = new Date().toISOString();

  return {
    id: `${job.source}:${job.sourceJobId}`,
    source: "manual",
    sourceJobId: null,
    title: job.title,
    employer: job.employer,
    jobUrl: job.jobUrl,
    applicationLink: job.applicationLink,
    datePosted: job.postedAt,
    deadline: null,
    salary: null,
    location: job.location,
    status: "discovered",
    outcome: null,
    closedAt: null,
    suitabilityScore: null,
    sponsorMatchScore: null,
    appliedDuplicateMatch: null,
    jobType: null,
    jobFunction: null,
    pdfRegenerating: false,
    pdfFreshness: "missing",
    salaryMinAmount: null,
    salaryMaxAmount: null,
    salaryCurrency: null,
    discoveredAt: now,
    readyAt: null,
    appliedAt: null,
    updatedAt: now,
  };
}

export function getPipelineSearchMatch(
  job: JobListItem,
  searchTerms: string[],
): { score: number; term: string | null } {
  let best = { score: 0, term: null as string | null };

  for (const term of searchTerms) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) continue;

    const score = computeJobMatchScore(job, normalizedTerm);
    if (score > best.score) {
      best = { score, term };
    }
  }

  return best;
}

export function normalizeUiCountryKey(value: string): string {
  const normalized = normalizeCountryKey(value);
  if (normalized === "usa/ca") return "united states";
  return normalized;
}

export function getWatchlistJobKey(source: string, externalId: string): string {
  return `${source}:${externalId}`;
}

export function formatWatchlistCheckTimestamp(
  value: string | null,
): string | null {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function getWorkspaceJobPath(job: {
  id: string;
  status: string;
}): string {
  const tab =
    job.status === "discovered"
      ? "discovered"
      : job.status === "applied" || job.status === "in_progress"
        ? "applied"
        : "ready";
  return `/jobs/${tab}/${job.id}`;
}

export function rankWatchlistJobs(
  jobs: WatchlistJobResult[],
  searchTerms: string[],
  locationIntent: LocationIntent,
): RankedWatchlistJob[] {
  const hasSelectedLocation = Boolean(locationIntent.selectedCountry);

  return jobs
    .map((watchlistJob, index) => {
      const job = toJobListItem(watchlistJob);
      const match = getPipelineSearchMatch(job, searchTerms);
      const locationMatch = hasSelectedLocation
        ? matchJobLocationIntent(
            {
              location: job.location,
              locationEvidence: null,
              isRemote: /(?:^|\b)remote(?:\b|$)/i.test(job.location ?? ""),
            },
            locationIntent,
          )
        : { matched: false, priority: 0 as const };

      return {
        watchlistJob,
        job,
        matchScore: match.score,
        matchedSearchTerm: match.term,
        locationPriority: locationMatch.priority,
        locationMatched: locationMatch.matched,
        rowState: watchlistJob.rowState,
        index,
      };
    })
    .sort((left, right) => {
      if (left.matchScore !== right.matchScore) {
        return right.matchScore - left.matchScore;
      }
      if (left.locationPriority !== right.locationPriority) {
        return right.locationPriority - left.locationPriority;
      }
      if (left.locationMatched !== right.locationMatched) {
        return left.locationMatched ? -1 : 1;
      }
      return left.index - right.index;
    });
}
