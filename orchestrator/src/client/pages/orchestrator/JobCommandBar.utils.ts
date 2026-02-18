import type { JobListItem, JobStatus } from "@shared/types.js";
import type { FilterTab } from "./constants";

export type CommandGroupId = "ready" | "discovered" | "applied" | "other";
export type StatusLock =
  | "ready"
  | "discovered"
  | "applied"
  | "skipped"
  | "expired";

export const commandGroupMeta: Array<{ id: CommandGroupId; heading: string }> =
  [
    { id: "ready", heading: "Ready" },
    { id: "discovered", heading: "Discovered" },
    { id: "applied", heading: "Applied" },
    { id: "other", heading: "Other" },
  ];

const lockAliases: Record<StatusLock, string[]> = {
  ready: ["ready", "rdy"],
  discovered: ["discovered", "discover", "disc"],
  applied: ["applied", "apply", "app"],
  skipped: ["skipped", "skip", "skp"],
  expired: ["expired", "expire", "exp"],
};

export const lockLabel: Record<StatusLock, string> = {
  ready: "ready",
  discovered: "discovered",
  applied: "applied",
  skipped: "skipped",
  expired: "expired",
};

const tokenRegex = /^\s*@([a-z-]*)/i;
const MINIMUM_MATCH_SCORE = 600;

const parseTime = (value: string | null) => {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const computeFieldMatchScore = (fieldRaw: string, needleRaw: string) => {
  const field = fieldRaw.trim().toLowerCase();
  const needle = needleRaw.trim().toLowerCase();
  if (!field || !needle) return 0;
  if (field === needle) return 1000;

  const words = field.split(/\s+/).filter(Boolean);
  if (words.includes(needle)) return 920;
  if (field.startsWith(needle)) return 880;
  if (words.some((word) => word.startsWith(needle))) return 820;
  if (field.includes(needle)) return 760;

  const compactField = field.replace(/\s+/g, "");
  if (compactField.includes(needle)) return 700;

  // Light typo-tolerance via ordered-character subsequence matching.
  let matchIndex = 0;
  for (const character of compactField) {
    if (character === needle[matchIndex]) {
      matchIndex += 1;
      if (matchIndex === needle.length) break;
    }
  }
  if (matchIndex === needle.length) {
    const density = needle.length / compactField.length;
    return Math.round(500 + density * 100);
  }
  return 0;
};

export const getCommandGroup = (status: JobStatus): CommandGroupId => {
  if (status === "ready") return "ready";
  if (status === "discovered" || status === "processing") return "discovered";
  if (status === "applied") return "applied";
  return "other";
};

export const getFilterTab = (status: JobStatus): FilterTab => {
  if (status === "ready") return "ready";
  if (status === "discovered" || status === "processing") return "discovered";
  if (status === "applied") return "applied";
  return "all";
};

export const extractLeadingAtToken = (input: string) => {
  const match = tokenRegex.exec(input);
  if (!match) return null;
  return match[1].toLowerCase();
};

export const stripLeadingAtToken = (input: string) =>
  input.replace(tokenRegex, "").trimStart();

export const getLockMatchesFromAliasPrefix = (
  rawToken: string,
): StatusLock[] => {
  const token = rawToken.trim().toLowerCase();
  if (!token) return Object.keys(lockAliases) as StatusLock[];

  const matches: StatusLock[] = [];
  for (const [status, aliases] of Object.entries(lockAliases) as Array<
    [StatusLock, string[]]
  >) {
    if (aliases.some((alias) => alias.startsWith(token))) {
      matches.push(status);
    }
  }
  return matches;
};

export const resolveLockFromAliasPrefix = (
  rawToken: string,
): StatusLock | null => {
  const matches = getLockMatchesFromAliasPrefix(rawToken);
  if (matches.length !== 1) return null;
  return matches[0];
};

export const jobMatchesLock = (job: JobListItem, lock: StatusLock) => {
  if (lock === "ready") return job.status === "ready";
  if (lock === "discovered") return job.status === "discovered";
  if (lock === "applied") return job.status === "applied";
  if (lock === "skipped") return job.status === "skipped";
  if (lock === "expired") return job.status === "expired";
  return false;
};

export const computeJobMatchScore = (
  job: JobListItem,
  normalizedQuery: string,
) => {
  if (!normalizedQuery) return 0;
  const titleScore = computeFieldMatchScore(job.title, normalizedQuery);
  const employerScore = computeFieldMatchScore(job.employer, normalizedQuery);
  const locationScore = computeFieldMatchScore(
    job.location ?? "",
    normalizedQuery,
  );

  // Prefer title/company matches over location when scores tie.
  // Only apply bias when a field actually matched.
  const titleRankedScore = titleScore > 0 ? titleScore + 8 : 0;
  const employerRankedScore = employerScore > 0 ? employerScore + 12 : 0;
  return Math.max(titleRankedScore, employerRankedScore, locationScore);
};

export const groupJobsForCommandBar = (
  scopedJobs: JobListItem[],
  normalizedQuery: string,
): Record<CommandGroupId, JobListItem[]> => {
  const groups: Record<CommandGroupId, JobListItem[]> = {
    ready: [],
    discovered: [],
    applied: [],
    other: [],
  };

  const scoredJobs = normalizedQuery
    ? scopedJobs
        .map((job) => ({
          job,
          score: computeJobMatchScore(job, normalizedQuery),
        }))
        .filter(({ score }) => score >= MINIMUM_MATCH_SCORE)
    : scopedJobs.map((job) => ({ job, score: 0 }));

  const sorted = scoredJobs.sort((a, b) => {
    if (normalizedQuery && a.score !== b.score) return b.score - a.score;

    const first = parseTime(a.job.discoveredAt);
    const second = parseTime(b.job.discoveredAt);
    if (!Number.isNaN(first) && !Number.isNaN(second)) {
      return second - first;
    }
    if (!Number.isNaN(first)) return -1;
    if (!Number.isNaN(second)) return 1;
    return b.job.id.localeCompare(a.job.id);
  });

  for (const { job } of sorted) {
    groups[getCommandGroup(job.status)].push(job);
  }
  return groups;
};

export const orderCommandGroups = (
  groupedJobs: Record<CommandGroupId, JobListItem[]>,
  normalizedQuery: string,
) => {
  if (!normalizedQuery) return commandGroupMeta;

  const withScores = commandGroupMeta.map((group) => {
    const maxScore = groupedJobs[group.id].reduce(
      (currentMax, job) =>
        Math.max(currentMax, computeJobMatchScore(job, normalizedQuery)),
      0,
    );
    return {
      ...group,
      maxScore,
    };
  });

  return withScores.sort((a, b) => {
    if (a.maxScore !== b.maxScore) return b.maxScore - a.maxScore;
    return (
      commandGroupMeta.findIndex((group) => group.id === a.id) -
      commandGroupMeta.findIndex((group) => group.id === b.id)
    );
  });
};
