import type { JobSource } from "@shared/types";

export type AutomaticPresetId = "fast" | "balanced" | "detailed";

export interface AutomaticRunValues {
  topN: number;
  minSuitabilityScore: number;
  searchTerms: string[];
  jobspyResultsWanted: number;
  gradcrackerMaxJobsPerTerm: number;
  ukvisajobsMaxJobs: number;
}

export interface AutomaticPresetValues {
  topN: number;
  minSuitabilityScore: number;
  jobspyResultsWanted: number;
  gradcrackerMaxJobsPerTerm: number;
  ukvisajobsMaxJobs: number;
}

export interface AutomaticEstimate {
  discovered: {
    min: number;
    max: number;
    cap: number;
  };
  processed: {
    min: number;
    max: number;
  };
}

export const AUTOMATIC_PRESETS: Record<AutomaticPresetId, AutomaticPresetValues> = {
  fast: {
    topN: 5,
    minSuitabilityScore: 75,
    jobspyResultsWanted: 60,
    gradcrackerMaxJobsPerTerm: 25,
    ukvisajobsMaxJobs: 25,
  },
  balanced: {
    topN: 10,
    minSuitabilityScore: 50,
    jobspyResultsWanted: 200,
    gradcrackerMaxJobsPerTerm: 50,
    ukvisajobsMaxJobs: 50,
  },
  detailed: {
    topN: 20,
    minSuitabilityScore: 35,
    jobspyResultsWanted: 350,
    gradcrackerMaxJobsPerTerm: 120,
    ukvisajobsMaxJobs: 120,
  },
};

export const RUN_MEMORY_STORAGE_KEY = "jobops.pipeline.run-memory.v1";

export interface AutomaticRunMemory {
  topN: number;
  minSuitabilityScore: number;
}

export function parseSearchTermsInput(input: string): string[] {
  return input
    .split(/[\n,]/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function stringifySearchTerms(terms: string[]): string {
  return terms.join("\n");
}

export function calculateAutomaticEstimate(args: {
  values: AutomaticRunValues;
  sources: JobSource[];
}): AutomaticEstimate {
  const { values, sources } = args;
  const termCount = Math.max(1, values.searchTerms.length);
  const hasGradcracker = sources.includes("gradcracker");
  const hasUkVisaJobs = sources.includes("ukvisajobs");
  const hasIndeed = sources.includes("indeed");
  const hasLinkedIn = sources.includes("linkedin");

  const jobspySitesCount = [hasIndeed, hasLinkedIn].filter(Boolean).length;
  const jobspyCap = jobspySitesCount * values.jobspyResultsWanted * termCount;
  const gradcrackerCap = hasGradcracker
    ? values.gradcrackerMaxJobsPerTerm * termCount
    : 0;
  const ukvisaCap = hasUkVisaJobs ? values.ukvisajobsMaxJobs : 0;

  const discoveredCap = jobspyCap + gradcrackerCap + ukvisaCap;
  const discoveredMin = Math.round(discoveredCap * 0.35);
  const discoveredMax = Math.round(discoveredCap * 0.75);
  const processedMin = Math.min(values.topN, discoveredMin);
  const processedMax = Math.min(values.topN, discoveredMax);

  return {
    discovered: {
      min: discoveredMin,
      max: discoveredMax,
      cap: discoveredCap,
    },
    processed: {
      min: processedMin,
      max: processedMax,
    },
  };
}

export function loadAutomaticRunMemory(): AutomaticRunMemory | null {
  try {
    const raw = localStorage.getItem(RUN_MEMORY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AutomaticRunMemory>;
    if (
      typeof parsed.topN !== "number" ||
      typeof parsed.minSuitabilityScore !== "number"
    ) {
      return null;
    }
    return {
      topN: Math.min(50, Math.max(1, Math.round(parsed.topN))),
      minSuitabilityScore: Math.min(
        100,
        Math.max(0, Math.round(parsed.minSuitabilityScore)),
      ),
    };
  } catch {
    return null;
  }
}

export function saveAutomaticRunMemory(memory: AutomaticRunMemory): void {
  try {
    localStorage.setItem(RUN_MEMORY_STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Ignore localStorage failures
  }
}
