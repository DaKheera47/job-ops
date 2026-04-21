import { beforeEach, describe, expect, it } from "vitest";
import {
  AUTOMATIC_PRESETS,
  calculateAutomaticEstimate,
  deriveExtractorLimits,
  inferAutomaticPresetSelection,
  loadAutomaticRunMemory,
  parseSearchTermsInput,
  RUN_MEMORY_STORAGE_KEY,
} from "./automatic-run";

function ensureStorage(): Storage {
  const existing = globalThis.localStorage as Partial<Storage> | undefined;
  const hasStorageShape =
    existing &&
    typeof existing.getItem === "function" &&
    typeof existing.setItem === "function" &&
    typeof existing.removeItem === "function" &&
    typeof existing.clear === "function";

  if (hasStorageShape) {
    return existing as Storage;
  }

  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      const value = store.get(key);
      return value ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };

  Object.defineProperty(globalThis, "localStorage", {
    value: storage,
    configurable: true,
    writable: true,
  });

  return storage;
}

describe("automatic-run utilities", () => {
  beforeEach(() => {
    ensureStorage().clear();
  });

  it("exposes the expected preset values", () => {
    expect(AUTOMATIC_PRESETS.fast).toEqual({
      topN: 5,
      minSuitabilityScore: 75,
      runBudget: 300,
    });

    expect(AUTOMATIC_PRESETS.detailed.topN).toBeGreaterThan(
      AUTOMATIC_PRESETS.fast.topN,
    );
  });

  it("calculates estimate range with source caps and topN clipping", () => {
    const estimate = calculateAutomaticEstimate({
      values: {
        topN: 10,
        minSuitabilityScore: 50,
        searchTerms: ["backend", "platform"],
        runBudget: 100,
        country: "united kingdom",
        cityLocations: [],
        workplaceTypes: ["remote", "hybrid", "onsite"],
        searchScope: "selected_only",
        matchStrictness: "exact_only",
      },
      sources: ["indeed", "linkedin", "gradcracker", "ukvisajobs"],
    });

    expect(estimate.discovered.cap).toBe(100);
    expect(estimate.discovered.min).toBe(35);
    expect(estimate.discovered.max).toBe(75);
    expect(estimate.processed.min).toBe(10);
    expect(estimate.processed.max).toBe(10);
  });

  it("keeps discovered cap under budget regardless of search-term count", () => {
    const limits = deriveExtractorLimits({
      budget: 750,
      searchTerms: ["a", "b", "c"],
      sources: ["indeed", "linkedin", "glassdoor", "gradcracker"],
    });

    const cap =
      3 * limits.jobspyResultsWanted * 3 + limits.gradcrackerMaxJobsPerTerm * 3;

    expect(cap).toBeLessThanOrEqual(750);
  });

  it("assigns a dedicated startupjobs max-jobs limit", () => {
    const limits = deriveExtractorLimits({
      budget: 120,
      searchTerms: ["backend", "platform"],
      sources: ["startupjobs"],
    });

    expect(limits.startupjobsMaxJobsPerTerm).toBeGreaterThan(0);
    expect(limits.startupjobsMaxJobsPerTerm).toBeLessThanOrEqual(120);
  });

  it("infers the balanced preset from legacy memory without an explicit preset id", () => {
    ensureStorage().setItem(
      RUN_MEMORY_STORAGE_KEY,
      JSON.stringify({
        topN: AUTOMATIC_PRESETS.balanced.topN,
        minSuitabilityScore: AUTOMATIC_PRESETS.balanced.minSuitabilityScore,
      }),
    );

    expect(loadAutomaticRunMemory()).toEqual({
      topN: AUTOMATIC_PRESETS.balanced.topN,
      minSuitabilityScore: AUTOMATIC_PRESETS.balanced.minSuitabilityScore,
      runBudget: AUTOMATIC_PRESETS.balanced.runBudget,
      presetId: "balanced",
    });
  });

  it("preserves explicit custom memory even when the numbers match a preset", () => {
    ensureStorage().setItem(
      RUN_MEMORY_STORAGE_KEY,
      JSON.stringify({
        topN: AUTOMATIC_PRESETS.balanced.topN,
        minSuitabilityScore: AUTOMATIC_PRESETS.balanced.minSuitabilityScore,
        runBudget: AUTOMATIC_PRESETS.balanced.runBudget,
        presetId: "custom",
      }),
    );

    expect(loadAutomaticRunMemory()).toEqual({
      topN: AUTOMATIC_PRESETS.balanced.topN,
      minSuitabilityScore: AUTOMATIC_PRESETS.balanced.minSuitabilityScore,
      runBudget: AUTOMATIC_PRESETS.balanced.runBudget,
      presetId: "custom",
    });
  });

  it("infers custom when legacy values do not match a preset", () => {
    expect(
      inferAutomaticPresetSelection({
        topN: 7,
        minSuitabilityScore: 60,
      }),
    ).toBe("custom");
  });

  it("returns zero estimate when no search terms are provided", () => {
    const estimate = calculateAutomaticEstimate({
      values: {
        topN: 10,
        minSuitabilityScore: 50,
        searchTerms: [],
        runBudget: 750,
        country: "united kingdom",
        cityLocations: [],
        workplaceTypes: ["remote", "hybrid", "onsite"],
        searchScope: "selected_only",
        matchStrictness: "exact_only",
      },
      sources: ["indeed", "linkedin", "gradcracker", "ukvisajobs"],
    });

    expect(estimate).toEqual({
      discovered: { min: 0, max: 0, cap: 0 },
      processed: { min: 0, max: 0 },
    });
  });

  it("parses comma and newline separated search terms", () => {
    expect(parseSearchTermsInput("backend, platform\napi\n\n")).toEqual([
      "backend",
      "platform",
      "api",
    ]);
  });

  it("includes adzuna in estimate caps", () => {
    const estimate = calculateAutomaticEstimate({
      values: {
        topN: 10,
        minSuitabilityScore: 50,
        searchTerms: ["backend", "platform"],
        runBudget: 120,
        country: "united kingdom",
        cityLocations: [],
        workplaceTypes: ["remote", "hybrid", "onsite"],
        searchScope: "selected_only",
        matchStrictness: "exact_only",
      },
      sources: ["adzuna"],
    });

    expect(estimate.discovered.cap).toBeGreaterThan(0);
    expect(estimate.discovered.cap).toBeLessThanOrEqual(120);
  });

  it("includes hiringcafe in estimate caps using the shared term budget", () => {
    const estimate = calculateAutomaticEstimate({
      values: {
        topN: 10,
        minSuitabilityScore: 50,
        searchTerms: ["backend", "platform"],
        runBudget: 120,
        country: "united kingdom",
        cityLocations: [],
        workplaceTypes: ["remote", "hybrid", "onsite"],
        searchScope: "selected_only",
        matchStrictness: "exact_only",
      },
      sources: ["hiringcafe"],
    });

    expect(estimate.discovered.cap).toBeGreaterThan(0);
    expect(estimate.discovered.cap).toBeLessThanOrEqual(120);
  });

  it("includes startupjobs in estimate caps using the shared term budget", () => {
    const estimate = calculateAutomaticEstimate({
      values: {
        topN: 10,
        minSuitabilityScore: 50,
        searchTerms: ["backend", "platform"],
        runBudget: 120,
        country: "united kingdom",
        cityLocations: [],
        workplaceTypes: ["remote", "hybrid", "onsite"],
        searchScope: "selected_only",
        matchStrictness: "exact_only",
      },
      sources: ["startupjobs"],
    });

    expect(estimate.discovered.cap).toBeGreaterThan(0);
    expect(estimate.discovered.cap).toBeLessThanOrEqual(120);
  });

  it("includes workingnomads in estimate caps using the shared term budget", () => {
    const estimate = calculateAutomaticEstimate({
      values: {
        topN: 10,
        minSuitabilityScore: 50,
        searchTerms: ["backend", "platform"],
        runBudget: 120,
        country: "united kingdom",
        cityLocations: [],
        workplaceTypes: ["remote", "hybrid", "onsite"],
        searchScope: "selected_only",
        matchStrictness: "exact_only",
      },
      sources: ["workingnomads"],
    });

    expect(estimate.discovered.cap).toBeGreaterThan(0);
    expect(estimate.discovered.cap).toBeLessThanOrEqual(120);
  });

  it("includes seek in estimate caps using the shared term budget", () => {
    const estimate = calculateAutomaticEstimate({
      values: {
        topN: 10,
        minSuitabilityScore: 50,
        searchTerms: ["backend", "platform"],
        runBudget: 120,
        country: "australia",
        cityLocations: [],
        workplaceTypes: ["remote", "hybrid", "onsite"],
        searchScope: "selected_only",
        matchStrictness: "exact_only",
      },
      sources: ["seek"],
    });

    expect(estimate.discovered.cap).toBeGreaterThan(0);
    expect(estimate.discovered.cap).toBeLessThanOrEqual(120);
  });
});
