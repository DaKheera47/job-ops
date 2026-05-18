import type {
  NormalizedWorkdayJob,
  NormalizedWorkdayJobDetails,
} from "@client/api/workday";
import { matchJobLocationIntent } from "@shared/job-matching.js";
import type { LocationIntent } from "@shared/location-intelligence.js";
import { normalizeCountryKey } from "@shared/location-support.js";
import type { JobListItem, ManualJobDraft } from "@shared/types.js";
import { computeJobMatchScore } from "../orchestrator/JobCommandBar.utils";
import type { RankedWorkdayJob, SourceSelectionDraft } from "./types";

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
    return "Workday";
  }
}

export function toJobListItem(
  job: NormalizedWorkdayJob,
  careersUrl: string,
): JobListItem {
  const now = new Date().toISOString();

  return {
    id: `workday:${careersUrl}:${job.externalId}`,
    source: "manual",
    sourceJobId: null,
    title: job.title,
    employer: job.company ?? getEmployerFromCareersUrl(careersUrl),
    jobUrl: job.jobUrl,
    applicationLink: job.jobUrl,
    datePosted: job.postedOn ?? null,
    deadline: null,
    salary: null,
    location: job.locationText ?? null,
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

export function toSourceSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function getWorkdayTenantFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const [tenant] = url.hostname.split(".");
    return tenant || null;
  } catch {
    return null;
  }
}

export function toWorkdaySource(value: string): string {
  const slug = toSourceSlug(getWorkdayTenantFromUrl(value) ?? value);
  return `workday:${slug || "unknown"}`;
}

export function getWorkdayImportKey(
  source: string,
  externalId: string,
): string {
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

export function getWorkspaceJobPath(job: JobListItem): string {
  const tab =
    job.status === "discovered"
      ? "discovered"
      : job.status === "applied" || job.status === "in_progress"
        ? "applied"
        : "ready";
  return `/jobs/${tab}/${job.id}`;
}

export function getSourceHost(value: string): string | null {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}

export function buildManualDraftFromWorkdayJob(
  job: NormalizedWorkdayJob,
  details: NormalizedWorkdayJobDetails,
  careersUrl: string,
  cxsJobsUrl: string,
): ManualJobDraft {
  const employer =
    details.company ?? job.company ?? getEmployerFromCareersUrl(careersUrl);

  return {
    source: toWorkdaySource(cxsJobsUrl || careersUrl || employer),
    sourceJobId: job.externalId,
    title: details.title || job.title,
    employer,
    jobUrl: details.jobUrl || job.jobUrl,
    applicationLink: details.jobUrl || job.jobUrl,
    location: details.locationText ?? job.locationText,
    jobDescription: details.jobDescriptionText,
    jobType: details.timeType,
  };
}

export function rankWorkdayJobs(
  jobs: NormalizedWorkdayJob[],
  careersUrl: string,
  searchTerms: string[],
  locationIntent: LocationIntent,
): RankedWorkdayJob[] {
  const hasSelectedLocation = Boolean(locationIntent.selectedCountry);

  return jobs
    .map((workdayJob, index) => {
      const job = toJobListItem(workdayJob, careersUrl);
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
        workdayJob,
        job,
        matchScore: match.score,
        matchedSearchTerm: match.term,
        locationPriority: locationMatch.priority,
        locationMatched: locationMatch.matched,
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

export function getCompanyLogoUrl(careersUrl: string): string | null {
  // source url + /assets/logo
  try {
    return `${careersUrl}/assets/logo`;
  } catch {
    return null;
  }
}
