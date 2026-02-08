import type { JobSource } from "@shared/types";

export type AutomaticPresetId = "fast" | "balanced" | "detailed";

export interface AutomaticRunValues {
  topN: number;
  minSuitabilityScore: number;
  searchTerms: string[];
  runBudget: number;
  country: string;
}

export interface AutomaticPresetValues {
  topN: number;
  minSuitabilityScore: number;
  runBudget: number;
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

export const AUTOMATIC_PRESETS: Record<
  AutomaticPresetId,
  AutomaticPresetValues
> = {
  fast: {
    topN: 5,
    minSuitabilityScore: 75,
    runBudget: 300,
  },
  balanced: {
    topN: 10,
    minSuitabilityScore: 50,
    runBudget: 500,
  },
  detailed: {
    topN: 20,
    minSuitabilityScore: 35,
    runBudget: 750,
  },
};

export const RUN_MEMORY_STORAGE_KEY = "jobops.pipeline.run-memory.v1";

export interface AutomaticRunMemory {
  topN: number;
  minSuitabilityScore: number;
}

export interface ExtractorLimits {
  jobspyResultsWanted: number;
  gradcrackerMaxJobsPerTerm: number;
  ukvisajobsMaxJobs: number;
}

export function deriveExtractorLimits(args: {
  budget: number;
  searchTerms: string[];
  sources: JobSource[];
}): ExtractorLimits {
  const budget = Math.max(1, Math.round(args.budget));
  const termCount = Math.max(1, args.searchTerms.length);
  const includesIndeed = args.sources.includes("indeed");
  const includesLinkedIn = args.sources.includes("linkedin");
  const includesGradcracker = args.sources.includes("gradcracker");
  const includesUkVisaJobs = args.sources.includes("ukvisajobs");

  const weightedContributors =
    (includesIndeed ? termCount : 0) +
    (includesLinkedIn ? termCount : 0) +
    (includesGradcracker ? termCount : 0) +
    (includesUkVisaJobs ? 1 : 0);

  if (weightedContributors <= 0) {
    return {
      jobspyResultsWanted: budget,
      gradcrackerMaxJobsPerTerm: budget,
      ukvisajobsMaxJobs: budget,
    };
  }

  const perUnit = Math.max(1, Math.floor(budget / weightedContributors));
  const remainder = Math.max(0, budget - perUnit * weightedContributors);

  return {
    jobspyResultsWanted: perUnit,
    gradcrackerMaxJobsPerTerm: perUnit,
    ukvisajobsMaxJobs: Math.min(budget, perUnit + remainder),
  };
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
  if (values.searchTerms.length === 0) {
    return {
      discovered: {
        min: 0,
        max: 0,
        cap: 0,
      },
      processed: {
        min: 0,
        max: 0,
      },
    };
  }

  const termCount = values.searchTerms.length;
  const hasGradcracker = sources.includes("gradcracker");
  const hasUkVisaJobs = sources.includes("ukvisajobs");
  const hasIndeed = sources.includes("indeed");
  const hasLinkedIn = sources.includes("linkedin");
  const limits = deriveExtractorLimits({
    budget: values.runBudget,
    searchTerms: values.searchTerms,
    sources,
  });

  const jobspySitesCount = [hasIndeed, hasLinkedIn].filter(Boolean).length;
  const jobspyCap = jobspySitesCount * limits.jobspyResultsWanted * termCount;
  const gradcrackerCap = hasGradcracker
    ? limits.gradcrackerMaxJobsPerTerm * termCount
    : 0;
  const ukvisaCap = hasUkVisaJobs ? limits.ukvisajobsMaxJobs : 0;

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
