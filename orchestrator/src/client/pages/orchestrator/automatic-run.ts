import {
  buildLocationPreferencesSummary,
  type LocationInputMode,
  type LocationMatchStrictness,
  type LocationSearchScope,
  normalizeLocationMatchStrictness,
  normalizeLocationSearchScope,
} from "@shared/location-preferences.js";
import {
  parseSearchCitiesSetting,
  serializeSearchCitiesSetting,
} from "@shared/search-cities.js";
import {
  deriveExtractorLimits,
  type LocationProximity,
  normalizePipelineRunBudget,
} from "@shared/types";
import { getAuthScopedStorageKey } from "@/client/api/client";

export type AutomaticPresetId = "fast" | "balanced" | "detailed";
export type AutomaticPresetSelection = AutomaticPresetId | "custom";
export type WorkplaceType = "remote" | "hybrid" | "onsite";
export const WORKPLACE_TYPE_OPTIONS: WorkplaceType[] = [
  "remote",
  "hybrid",
  "onsite",
];

export interface AutomaticRunValues {
  topN: number;
  minSuitabilityScore: number;
  searchTerms: string[];
  scoringInstructions: string;
  runBudget: number;
  country: string;
  cityLocations: string[];
  locationMode: LocationInputMode;
  proximity: LocationProximity | null;
  workplaceTypes: WorkplaceType[];
  searchScope: LocationSearchScope;
  matchStrictness: LocationMatchStrictness;
  // Optional override for per-#621 Watchlist source selection. When
  // omitted, usePipelineControls falls back to the global hook selection.
  watchlistSelectedSourceIds?: string[];
}

export interface AutomaticPresetValues {
  topN: number;
  minSuitabilityScore: number;
  runBudget: number;
}

function isAutomaticPresetSelection(
  value: unknown,
): value is AutomaticPresetSelection {
  return (
    value === "custom" ||
    value === "fast" ||
    value === "balanced" ||
    value === "detailed"
  );
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

export function getRunMemoryStorageKey(): string {
  return getAuthScopedStorageKey(RUN_MEMORY_STORAGE_KEY);
}

function readRunMemoryStorage(): string | null {
  const storageKey = getRunMemoryStorageKey();
  const scoped = localStorage.getItem(storageKey);
  if (scoped || storageKey === RUN_MEMORY_STORAGE_KEY) return scoped;
  return localStorage.getItem(RUN_MEMORY_STORAGE_KEY);
}

function migrateLegacyRunMemoryStorage(raw: string): void {
  const storageKey = getRunMemoryStorageKey();
  if (storageKey === RUN_MEMORY_STORAGE_KEY) return;
  if (localStorage.getItem(storageKey)) return;
  localStorage.setItem(storageKey, raw);
}

export const SEARCH_SCOPE_OPTIONS: Array<{
  value: LocationSearchScope;
  label: string;
  description: string;
}> = [
  {
    value: "selected_only",
    label: "Only selected locations",
    description: "Limit results to your chosen map area or cities.",
  },
  {
    value: "selected_plus_remote_worldwide",
    label: "Selected locations + remote worldwide",
    description: "Also include remote roles available worldwide.",
  },
  {
    value: "remote_worldwide_prioritize_selected",
    label: "Remote worldwide",
    description: "Search globally and prioritise your selected locations.",
  },
];

export const MATCH_STRICTNESS_OPTIONS: Array<{
  value: LocationMatchStrictness;
  label: string;
  description: string;
}> = [
  {
    value: "exact_only",
    label: "Exact matches only",
    description: "Only jobs explicitly matching your selected location.",
  },
  {
    value: "flexible",
    label: "Include likely matches",
    description: "Include nearby and plausibly compatible locations.",
  },
];

export interface AutomaticRunMemory {
  topN: number;
  minSuitabilityScore: number;
  presetId?: AutomaticPresetSelection;
  runBudget?: number;
}

export function normalizeWorkplaceTypes(
  workplaceTypes: WorkplaceType[] | null | undefined,
): WorkplaceType[] {
  const seen = new Set<WorkplaceType>();
  const out: WorkplaceType[] = [];

  for (const workplaceType of workplaceTypes ?? []) {
    if (!WORKPLACE_TYPE_OPTIONS.includes(workplaceType)) continue;
    if (seen.has(workplaceType)) continue;
    seen.add(workplaceType);
    out.push(workplaceType);
  }

  return out.length > 0 ? out : [...WORKPLACE_TYPE_OPTIONS];
}

export function inferAutomaticPresetSelection(args: {
  topN: number;
  minSuitabilityScore: number;
  runBudget?: number | null;
}): AutomaticPresetSelection {
  const hasRunBudget = args.runBudget !== null && args.runBudget !== undefined;

  if (
    args.topN === AUTOMATIC_PRESETS.fast.topN &&
    args.minSuitabilityScore === AUTOMATIC_PRESETS.fast.minSuitabilityScore &&
    (!hasRunBudget || args.runBudget === AUTOMATIC_PRESETS.fast.runBudget)
  ) {
    return "fast";
  }

  if (
    args.topN === AUTOMATIC_PRESETS.balanced.topN &&
    args.minSuitabilityScore ===
      AUTOMATIC_PRESETS.balanced.minSuitabilityScore &&
    (!hasRunBudget || args.runBudget === AUTOMATIC_PRESETS.balanced.runBudget)
  ) {
    return "balanced";
  }

  if (
    args.topN === AUTOMATIC_PRESETS.detailed.topN &&
    args.minSuitabilityScore ===
      AUTOMATIC_PRESETS.detailed.minSuitabilityScore &&
    (!hasRunBudget || args.runBudget === AUTOMATIC_PRESETS.detailed.runBudget)
  ) {
    return "detailed";
  }

  return "custom";
}

export { deriveExtractorLimits };

export function parseSearchTermsInput(input: string): string[] {
  return input
    .split(/[\n,]/g)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseCityLocationsInput(input: string): string[] {
  const parsed = parseSearchTermsInput(input);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const city of parsed) {
    const key = city.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(city);
  }
  return out;
}

export function parseCityLocationsSetting(
  location: string | null | undefined,
): string[] {
  return parseSearchCitiesSetting(location);
}

export function serializeCityLocationsSetting(cities: string[]): string | null {
  return serializeSearchCitiesSetting(cities);
}

export function summarizeLocationPreferences(
  values: Pick<
    AutomaticRunValues,
    | "country"
    | "cityLocations"
    | "proximity"
    | "workplaceTypes"
    | "searchScope"
    | "matchStrictness"
  >,
): string {
  return buildLocationPreferencesSummary({
    country: values.country,
    cityLocations: values.cityLocations,
    proximity: values.proximity,
    workplaceTypes: values.workplaceTypes,
    searchScope: normalizeLocationSearchScope(values.searchScope),
    matchStrictness: normalizeLocationMatchStrictness(values.matchStrictness),
  });
}

export function stringifySearchTerms(terms: string[]): string {
  return terms.join("\n");
}

export function loadAutomaticRunMemory(): AutomaticRunMemory | null {
  try {
    const raw = readRunMemoryStorage();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.topN !== "number" ||
      typeof parsed.minSuitabilityScore !== "number"
    ) {
      return null;
    }
    const topN = Math.min(50, Math.max(1, Math.round(parsed.topN)));
    const minSuitabilityScore = Math.min(
      100,
      Math.max(0, Math.round(parsed.minSuitabilityScore)),
    );
    const runBudget =
      typeof parsed.runBudget === "number"
        ? normalizePipelineRunBudget(parsed.runBudget)
        : undefined;
    const explicitPresetId = isAutomaticPresetSelection(parsed.presetId)
      ? parsed.presetId
      : null;
    migrateLegacyRunMemoryStorage(raw);

    if (explicitPresetId && explicitPresetId !== "custom") {
      const preset = AUTOMATIC_PRESETS[explicitPresetId];
      return {
        topN: preset.topN,
        minSuitabilityScore: preset.minSuitabilityScore,
        runBudget: preset.runBudget,
        presetId: explicitPresetId,
      };
    }

    if (explicitPresetId === "custom") {
      return {
        topN,
        minSuitabilityScore,
        ...(runBudget !== undefined ? { runBudget } : {}),
        presetId: "custom",
      };
    }

    const inferredPresetId = inferAutomaticPresetSelection({
      topN,
      minSuitabilityScore,
      runBudget,
    });

    if (inferredPresetId !== "custom") {
      const preset = AUTOMATIC_PRESETS[inferredPresetId];
      return {
        topN: preset.topN,
        minSuitabilityScore: preset.minSuitabilityScore,
        runBudget: preset.runBudget,
        presetId: inferredPresetId,
      };
    }

    return {
      topN,
      minSuitabilityScore,
      ...(runBudget !== undefined ? { runBudget } : {}),
      presetId: "custom",
    };
  } catch {
    return null;
  }
}

export function saveAutomaticRunMemory(memory: AutomaticRunMemory): void {
  try {
    localStorage.setItem(
      getRunMemoryStorageKey(),
      JSON.stringify(
        memory.runBudget === undefined
          ? memory
          : {
              ...memory,
              runBudget: normalizePipelineRunBudget(memory.runBudget),
            },
      ),
    );
  } catch {
    // Ignore localStorage failures
  }
}
