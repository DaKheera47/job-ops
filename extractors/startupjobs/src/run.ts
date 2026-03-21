import {
  formatCountryLabel,
  normalizeCountryKey,
} from "@shared/location-support.js";
import { resolveSearchCities } from "@shared/search-cities.js";
import type { CreateJobInput } from "@shared/types/jobs";
import {
  type StartupJobRecord,
  scrapeStartupJobsViaAlgolia,
} from "startup-jobs-scraper";

export type StartupJobsProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      location?: string;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      location?: string;
      jobsFoundTerm: number;
    };

export interface RunStartupJobsOptions {
  searchTerms?: string[];
  selectedCountry?: string;
  locations?: string[];
  workplaceTypes?: Array<"remote" | "hybrid" | "onsite">;
  maxJobsPerTerm?: number;
  onProgress?: (event: StartupJobsProgressEvent) => void;
  shouldCancel?: () => boolean;
}

export interface StartupJobsResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

type StartupJobsWorkplaceType = "remote" | "hybrid" | "on-site";

function mapWorkplaceTypes(
  workplaceTypes: Array<"remote" | "hybrid" | "onsite"> | undefined,
): StartupJobsWorkplaceType[] | undefined {
  if (!workplaceTypes || workplaceTypes.length === 0) return undefined;

  return workplaceTypes.map((workplaceType) =>
    workplaceType === "onsite" ? "on-site" : workplaceType,
  );
}

function toPositiveIntOrFallback(
  value: number | string | undefined,
  fallback: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseInt(value, 10)
        : Number.NaN;

  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function inferJobType(disciplines: string | undefined): string | undefined {
  if (!disciplines) return undefined;
  const segments = disciplines
    .split("|")
    .map((value) => value.trim())
    .filter(Boolean);
  return segments.length > 1 ? segments[segments.length - 1] : undefined;
}

function mapStartupJob(row: StartupJobRecord): CreateJobInput | null {
  if (!row.jobUrl) return null;

  return {
    source: "startupjobs",
    title: row.title || "Unknown Title",
    employer: row.employer || "Unknown Employer",
    employerUrl: row.employerUrl || undefined,
    jobUrl: row.jobUrl,
    applicationLink: row.applicationLink || row.jobUrl,
    disciplines: row.disciplines || undefined,
    deadline: row.deadline || undefined,
    salary: row.salary || undefined,
    location: row.location || undefined,
    degreeRequired: row.degreeRequired || undefined,
    starting: row.starting || undefined,
    jobDescription: row.jobDescription || undefined,
    jobType: inferJobType(row.disciplines),
    isRemote: row.location?.toLowerCase().includes("remote") ?? undefined,
  };
}

function resolveRunLocations(args: {
  selectedCountry?: string;
  locations?: string[];
}): Array<string | null> {
  const locations = resolveSearchCities({
    list: args.locations,
  });

  const normalizedLocations = locations
    .map((location) => normalizeCountryKey(location))
    .filter((location) => location !== "worldwide" && location !== "usa/ca");

  if (normalizedLocations.length > 0) {
    return normalizedLocations.map((location) => formatCountryLabel(location));
  }

  const countryKey = normalizeCountryKey(args.selectedCountry);
  if (!countryKey || countryKey === "worldwide" || countryKey === "usa/ca") {
    return [null];
  }

  return [formatCountryLabel(countryKey)];
}

export async function runStartupJobs(
  options: RunStartupJobsOptions = {},
): Promise<StartupJobsResult> {
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const runLocations = resolveRunLocations({
    selectedCountry: options.selectedCountry,
    locations: options.locations,
  });
  const maxJobsPerTerm = toPositiveIntOrFallback(options.maxJobsPerTerm, 50);
  const workplaceType = mapWorkplaceTypes(options.workplaceTypes);
  const termTotal = searchTerms.length * runLocations.length;
  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();
  let runIndex = 0;

  try {
    for (const location of runLocations) {
      for (const searchTerm of searchTerms) {
        runIndex += 1;
        if (options.shouldCancel?.()) {
          return { success: true, jobs };
        }

        options.onProgress?.({
          type: "term_start",
          termIndex: runIndex,
          termTotal,
          searchTerm,
          location: location ?? undefined,
        });

        const records = await scrapeStartupJobsViaAlgolia({
          query: searchTerm,
          requestedCount: maxJobsPerTerm,
          enrichDetails: true,
          location: location ?? undefined,
          workplaceType,
        });

        let jobsFoundTerm = 0;
        for (const record of records) {
          const mapped = mapStartupJob(record);
          if (!mapped) continue;
          const dedupeKey = mapped.jobUrl;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          jobs.push(mapped);
          jobsFoundTerm += 1;
        }

        options.onProgress?.({
          type: "term_complete",
          termIndex: runIndex,
          termTotal,
          searchTerm,
          location: location ?? undefined,
          jobsFoundTerm,
        });
      }
    }

    return {
      success: true,
      jobs,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unexpected error while running startup.jobs extractor.";
    const missingBrowser =
      /playwright|browser|executable/i.test(message) &&
      /install/i.test(message);
    return {
      success: false,
      jobs: [],
      error: missingBrowser
        ? `${message}. Install browser binaries with 'npx playwright install'.`
        : message,
    };
  }
}
