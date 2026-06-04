import {
  matchesRequestedCity,
  matchesRequestedCountry,
  shouldApplyStrictCityFilter,
} from "./search-cities.js";
import type { CreateJobInput } from "./types/jobs.js";
import type { LocationIntent } from "./types/location";
import { normalizeWhitespace } from "./utils/string";

const COMPANY_SUFFIXES = [
  "limited",
  "ltd",
  "llp",
  "plc",
  "inc",
  "incorporated",
  "corporation",
  "corp",
  "company",
  "co",
  "llc",
  "uk",
  "international",
  "intl",
  "group",
  "holdings",
  "t/a",
  "trading as",
  "&",
  "the",
];

function normalizeMatchText(value: string): string {
  const normalized = value.toLowerCase().trim();
  return normalizeWhitespace(
    normalized.replace(/[.,'"()[\]{}!?@#$%^&*+=|\\/<>:;`~_-]/g, " "),
  );
}

export function normalizeCompanyName(name: string): string {
  let normalized = normalizeMatchText(name);
  for (const suffix of COMPANY_SUFFIXES) {
    const regex = new RegExp(`\\b${suffix}\\b`, "gi");
    normalized = normalized.replace(regex, " ");
  }
  return normalizeWhitespace(normalized);
}

export function normalizeJobTitle(title: string): string {
  return normalizeMatchText(title);
}

export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) return 100;
  if (s1.length === 0 || s2.length === 0) return 0;

  if (s1.includes(s2) || s2.includes(s1)) {
    const longerLen = Math.max(s1.length, s2.length);
    const shorterLen = Math.min(s1.length, s2.length);
    return Math.round((shorterLen / longerLen) * 100);
  }

  const matrix: number[][] = [];
  for (let i = 0; i <= s1.length; i++) matrix[i] = [i];
  for (let j = 0; j <= s2.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  const distance = matrix[s1.length][s2.length];
  const maxLen = Math.max(s1.length, s2.length);
  return Math.round(((maxLen - distance) / maxLen) * 100);
}

function normalizeLocationCandidate(value: string): string | null {
  const trimmed = normalizeWhitespace(value);
  return trimmed.length > 0 ? trimmed : null;
}

export function getJobLocationCandidates(job: {
  location?: string | null;
  locationEvidence?:
    | Array<{
        value?: string | null;
      }>
    | {
        location?: string | null;
        country?: string | null;
        city?: string | null;
        workplaceType?: "remote" | "hybrid" | "onsite" | null;
      }
    | null;
}): string[] {
  const evidenceCandidates = Array.isArray(job.locationEvidence)
    ? job.locationEvidence.map((item) => item.value)
    : job.locationEvidence
      ? [
          job.locationEvidence.location,
          job.locationEvidence.country,
          job.locationEvidence.city,
          job.locationEvidence.workplaceType,
        ]
      : [];
  const candidates = [job.location, ...evidenceCandidates];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const normalized = normalizeLocationCandidate(candidate);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }

  return out;
}

export function matchJobLocationIntent(
  job: {
    location?: string | null;
    locationEvidence?: {
      location?: string | null;
      country?: string | null;
      city?: string | null;
      workplaceType?: "remote" | "hybrid" | "onsite" | null;
    } | null;
    isRemote?: boolean | null;
  },
  intent: LocationIntent,
): {
  matched: boolean;
  reasonCode: string;
  priority: 0 | 1;
} {
  const candidates = getJobLocationCandidates(job);
  const selectedCountry = intent.selectedCountry;

  if (!selectedCountry) {
    return { matched: true, reasonCode: "unfiltered", priority: 0 };
  }

  const countryMatched = candidates.some((candidate) =>
    matchesRequestedCountry(candidate, selectedCountry),
  );

  if (countryMatched) {
    if (intent.cityLocations.length === 0) {
      return { matched: true, reasonCode: "selected_location", priority: 1 };
    }

    const cityMatched = intent.cityLocations.some((requestedCity) => {
      const strict = shouldApplyStrictCityFilter(
        requestedCity,
        selectedCountry,
      );
      if (!strict) return true;
      return candidates.some((candidate) =>
        matchesRequestedCity(candidate, requestedCity),
      );
    });

    if (cityMatched || intent.matchStrictness === "flexible") {
      return { matched: true, reasonCode: "selected_location", priority: 1 };
    }
  }

  if (
    intent.workplaceTypes.includes("remote") &&
    intent.geoScope !== "selected_only" &&
    job.isRemote === true
  ) {
    return { matched: true, reasonCode: "remote_worldwide", priority: 0 };
  }

  return { matched: false, reasonCode: "no_match", priority: 0 };
}

const FUZZY_DEDUP_TITLE_THRESHOLD = 90;
const FUZZY_DEDUP_EMPLOYER_THRESHOLD = 85;

/**
 * Merge two CreateJobInput objects, preferring the first non-null/non-undefined
 * value for each optional field. Required fields (source, title, employer,
 * jobUrl) are taken from `base`.
 */
function mergeJobInputs(
  base: CreateJobInput,
  incoming: CreateJobInput,
): CreateJobInput {
  return {
    // Required — always from base
    source: base.source,
    title: base.title,
    employer: base.employer,
    jobUrl: base.jobUrl,
    // Optional — first non-null wins
    employerUrl: base.employerUrl ?? incoming.employerUrl,
    applicationLink: base.applicationLink ?? incoming.applicationLink,
    disciplines: base.disciplines ?? incoming.disciplines,
    deadline: base.deadline ?? incoming.deadline,
    salary: base.salary ?? incoming.salary,
    location: base.location ?? incoming.location,
    locationEvidence: base.locationEvidence ?? incoming.locationEvidence,
    degreeRequired: base.degreeRequired ?? incoming.degreeRequired,
    starting: base.starting ?? incoming.starting,
    jobDescription: base.jobDescription ?? incoming.jobDescription,
    sourceJobId: base.sourceJobId ?? incoming.sourceJobId,
    jobUrlDirect: base.jobUrlDirect ?? incoming.jobUrlDirect,
    datePosted: base.datePosted ?? incoming.datePosted,
    jobType: base.jobType ?? incoming.jobType,
    salarySource: base.salarySource ?? incoming.salarySource,
    salaryInterval: base.salaryInterval ?? incoming.salaryInterval,
    salaryMinAmount: base.salaryMinAmount ?? incoming.salaryMinAmount,
    salaryMaxAmount: base.salaryMaxAmount ?? incoming.salaryMaxAmount,
    salaryCurrency: base.salaryCurrency ?? incoming.salaryCurrency,
    isRemote: base.isRemote ?? incoming.isRemote,
    jobLevel: base.jobLevel ?? incoming.jobLevel,
    jobFunction: base.jobFunction ?? incoming.jobFunction,
    listingType: base.listingType ?? incoming.listingType,
    emails: base.emails ?? incoming.emails,
    companyIndustry: base.companyIndustry ?? incoming.companyIndustry,
    companyLogo: base.companyLogo ?? incoming.companyLogo,
    companyUrlDirect: base.companyUrlDirect ?? incoming.companyUrlDirect,
    companyAddresses: base.companyAddresses ?? incoming.companyAddresses,
    companyNumEmployees:
      base.companyNumEmployees ?? incoming.companyNumEmployees,
    companyRevenue: base.companyRevenue ?? incoming.companyRevenue,
    companyDescription: base.companyDescription ?? incoming.companyDescription,
    skills: base.skills ?? incoming.skills,
    experienceRange: base.experienceRange ?? incoming.experienceRange,
    companyRating: base.companyRating ?? incoming.companyRating,
    companyReviewsCount:
      base.companyReviewsCount ?? incoming.companyReviewsCount,
    vacancyCount: base.vacancyCount ?? incoming.vacancyCount,
    workFromHomeType: base.workFromHomeType ?? incoming.workFromHomeType,
  };
}

/**
 * Deduplicate a batch of discovered job listings by fuzzy-matching job title
 * and employer name. Near-duplicate entries (same role at the same company
 * scraped from different boards) are **merged** into a single enriched listing:
 * for each optional field, the first non-null value across all duplicates is
 * kept, so one listing's `location` and another's `salary` both survive.
 *
 * Reuses the existing `normalizeJobTitle`, `normalizeCompanyName`, and
 * `calculateSimilarity` helpers — no new normalization logic.
 *
 * @param jobs - Freshly discovered job inputs from the current scrape run.
 * @param opts - Optional threshold overrides.
 * @returns Deduplicated (and field-merged) list.
 */
export function deduplicateJobsByTitleAndEmployer(
  jobs: CreateJobInput[],
  opts?: {
    titleThreshold?: number;
    employerThreshold?: number;
  },
): CreateJobInput[] {
  const titleThreshold = opts?.titleThreshold ?? FUZZY_DEDUP_TITLE_THRESHOLD;
  const employerThreshold =
    opts?.employerThreshold ?? FUZZY_DEDUP_EMPLOYER_THRESHOLD;

  type PreparedEntry = {
    job: CreateJobInput;
    normalizedTitle: string;
    normalizedEmployer: string;
  };

  const merged: PreparedEntry[] = [];

  for (const incoming of jobs) {
    const normalizedTitle = normalizeJobTitle(incoming.title);
    const normalizedEmployer = normalizeCompanyName(incoming.employer);

    if (!normalizedTitle || !normalizedEmployer) {
      merged.push({ job: incoming, normalizedTitle, normalizedEmployer });
      continue;
    }

    const match = merged.find((entry) => {
      if (!entry.normalizedTitle || !entry.normalizedEmployer) return false;
      const titleScore = calculateSimilarity(
        normalizedTitle,
        entry.normalizedTitle,
      );
      if (titleScore <= titleThreshold) return false;
      const employerScore = calculateSimilarity(
        normalizedEmployer,
        entry.normalizedEmployer,
      );
      return employerScore > employerThreshold;
    });

    if (match) {
      // Merge incoming fields into the existing entry (first non-null wins).
      match.job = mergeJobInputs(match.job, incoming);
    } else {
      merged.push({ job: incoming, normalizedTitle, normalizedEmployer });
    }
  }

  return merged.map((entry) => entry.job);
}
