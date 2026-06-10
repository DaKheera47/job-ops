import { logger } from "@infra/logger";
import type { ExtractorRegistry } from "@server/extractors/registry";
import { getExtractorRegistry } from "@server/extractors/registry";
import {
  createConfiguredLlmService,
  resolveLlmModel,
} from "@server/services/modelSelection";
import {
  collectSearchTermContext,
  type SearchTermContext,
} from "@server/services/onboarding-search-terms";
import { getProfile } from "@server/services/profile";
import {
  EXTRACTOR_SOURCE_METADATA,
  type ExtractorSourceId,
  PIPELINE_EXTRACTOR_SOURCE_IDS,
} from "@shared/extractors";
import { planLocationSources } from "@shared/location-intelligence.js";
import {
  LOCATION_MATCH_STRICTNESS_VALUES,
  LOCATION_SEARCH_SCOPE_VALUES,
  normalizeLocationMatchStrictness,
  normalizeLocationSearchScope,
} from "@shared/location-preferences.js";
import {
  normalizeCountryKey,
  SUPPORTED_COUNTRY_KEYS,
} from "@shared/location-support.js";
import type {
  PipelineSearchPlanRequest,
  PipelineSearchPlanResponse,
  PipelineSearchPresetConfig,
} from "@shared/types";
import { normalizeSearchTerms } from "@shared/utils/search-terms";
import type { JsonSchemaDefinition } from "./llm/types";

const WORKPLACE_TYPE_VALUES = ["remote", "hybrid", "onsite"] as const;
const PRESET_VALUES = ["fast", "balanced", "detailed", "custom"] as const;
const MIN_RUN_BUDGET = 50;
const MAX_RUN_BUDGET = 1000;
const MAX_WARNINGS = 6;

type WorkplaceType = (typeof WORKPLACE_TYPE_VALUES)[number];

type SearchPlanModelResponse = {
  config?: Partial<PipelineSearchPresetConfig>;
  summary?: string;
  warnings?: string[];
};

const SEARCH_PLAN_SCHEMA: JsonSchemaDefinition = {
  name: "pipeline_search_plan",
  schema: {
    type: "object",
    properties: {
      config: {
        type: "object",
        properties: {
          searchTerms: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 12,
          },
          sources: {
            type: "array",
            items: {
              type: "string",
              enum: [...PIPELINE_EXTRACTOR_SOURCE_IDS],
            },
            minItems: 1,
          },
          country: { type: "string" },
          cityLocations: {
            type: "array",
            items: { type: "string" },
            maxItems: 25,
          },
          workplaceTypes: {
            type: "array",
            items: { type: "string", enum: [...WORKPLACE_TYPE_VALUES] },
            minItems: 1,
            maxItems: 3,
          },
          searchScope: {
            type: "string",
            enum: [...LOCATION_SEARCH_SCOPE_VALUES],
          },
          matchStrictness: {
            type: "string",
            enum: [...LOCATION_MATCH_STRICTNESS_VALUES],
          },
          topN: { type: "number" },
          minSuitabilityScore: { type: "number" },
          runBudget: { type: "number" },
          automaticPresetId: {
            type: "string",
            enum: [...PRESET_VALUES],
          },
        },
        required: [
          "searchTerms",
          "sources",
          "country",
          "cityLocations",
          "workplaceTypes",
          "searchScope",
          "matchStrictness",
          "topN",
          "minSuitabilityScore",
          "runBudget",
          "automaticPresetId",
        ],
        additionalProperties: false,
      },
      summary: { type: "string" },
      warnings: {
        type: "array",
        items: { type: "string" },
        maxItems: MAX_WARNINGS,
      },
    },
    required: ["config", "summary", "warnings"],
    additionalProperties: false,
  },
};

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeStrings(
  value: unknown,
  fallback: string[],
  maxItems: number,
  maxLength: number,
): string[] {
  const raw = Array.isArray(value) ? value : fallback;
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, maxLength);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }

  return out.length > 0 ? out : fallback.slice(0, maxItems);
}

function normalizeOptionalStrings(
  value: unknown,
  fallback: string[],
  maxItems: number,
  maxLength: number,
): string[] {
  if (!Array.isArray(value)) return fallback.slice(0, maxItems);
  const out: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, maxLength);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length >= maxItems) break;
  }

  return out;
}

function normalizeWorkplaceTypes(
  value: unknown,
  fallback: WorkplaceType[],
): WorkplaceType[] {
  const raw = Array.isArray(value) ? value : fallback;
  const out = raw.filter((item): item is WorkplaceType =>
    WORKPLACE_TYPE_VALUES.includes(item as WorkplaceType),
  );
  return out.length > 0 ? Array.from(new Set(out)) : fallback;
}

function normalizeSources(
  value: unknown,
  fallback: ExtractorSourceId[],
  registry: ExtractorRegistry,
): { sources: ExtractorSourceId[]; removed: string[] } {
  const raw = Array.isArray(value) ? value : fallback;
  const out: ExtractorSourceId[] = [];
  const removed: string[] = [];

  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (!PIPELINE_EXTRACTOR_SOURCE_IDS.includes(item as ExtractorSourceId)) {
      removed.push(item);
      continue;
    }
    const source = item as ExtractorSourceId;
    if (!registry.manifestBySource.has(source)) {
      removed.push(source);
      continue;
    }
    if (!out.includes(source)) out.push(source);
  }

  return {
    sources: out.length > 0 ? out : fallback,
    removed,
  };
}

function normalizeCountry(value: unknown, fallback: string): string {
  const normalized = normalizeCountryKey(
    typeof value === "string" ? value : fallback,
  );
  if (SUPPORTED_COUNTRY_KEYS.includes(normalized)) return normalized;
  return normalizeCountryKey(fallback);
}

function normalizeWarnings(value: unknown): string[] {
  return normalizeStrings(
    Array.isArray(value) ? value : [],
    [],
    MAX_WARNINGS,
    220,
  );
}

function normalizeSummary(value: unknown, source: "ai" | "fallback"): string {
  const summary = typeof value === "string" ? value.trim() : "";
  if (summary) return summary.slice(0, 500);
  return source === "ai"
    ? "Search settings were generated from your prompt."
    : "Search settings were left unchanged because AI planning was unavailable.";
}

function filterCompatibleSources(args: {
  config: PipelineSearchPresetConfig;
  registry: ExtractorRegistry;
  warnings: string[];
}): ExtractorSourceId[] {
  const { config, registry, warnings } = args;
  const locationPlan = planLocationSources({
    intent: {
      selectedCountry: config.country,
      cityLocations: config.cityLocations,
      workplaceTypes: config.workplaceTypes,
      geoScope: config.searchScope,
      searchScope: config.searchScope,
      matchStrictness: config.matchStrictness,
    },
    sources: config.sources,
    capabilitiesBySource: registry.locationCapabilitiesBySource ?? {},
  });
  const compatible = locationPlan.plans
    .filter((plan) => plan.canRun)
    .map((plan) => plan.source as ExtractorSourceId);
  const removed = config.sources.filter(
    (source) => !compatible.includes(source),
  );
  if (removed.length > 0) {
    warnings.push(
      `Removed sources that cannot run with this location setup: ${removed.join(", ")}.`,
    );
  }
  if (compatible.length > 0) return compatible;

  const fallbackPlan = planLocationSources({
    intent: {
      selectedCountry: config.country,
      cityLocations: config.cityLocations,
      workplaceTypes: config.workplaceTypes,
      geoScope: config.searchScope,
      searchScope: config.searchScope,
      matchStrictness: config.matchStrictness,
    },
    sources: [...PIPELINE_EXTRACTOR_SOURCE_IDS].filter((source) =>
      registry.manifestBySource.has(source),
    ),
    capabilitiesBySource: registry.locationCapabilitiesBySource ?? {},
  });
  const firstCompatible = fallbackPlan.compatibleSources.find((source) =>
    registry.manifestBySource.has(source as ExtractorSourceId),
  );

  if (firstCompatible) {
    warnings.push(
      `No requested sources were compatible, so ${firstCompatible} was selected instead.`,
    );
    return [firstCompatible as ExtractorSourceId];
  }

  warnings.push(
    "No compatible runtime source was available; keeping current source selection.",
  );
  return config.sources;
}

export function normalizePipelineSearchPlanConfig(args: {
  candidate: Partial<PipelineSearchPresetConfig> | null | undefined;
  currentConfig: PipelineSearchPresetConfig;
  registry: ExtractorRegistry;
  initialWarnings?: string[];
}): { config: PipelineSearchPresetConfig; warnings: string[] } {
  const { candidate, currentConfig, registry } = args;
  const warnings = [...(args.initialWarnings ?? [])];
  const searchTerms = normalizeSearchTerms(
    normalizeStrings(
      candidate?.searchTerms,
      currentConfig.searchTerms,
      12,
      200,
    ),
    { maxTerms: 12, maxLength: 200 },
  );
  const workplaceTypes = normalizeWorkplaceTypes(
    candidate?.workplaceTypes,
    currentConfig.workplaceTypes,
  );
  const sourcesResult = normalizeSources(
    candidate?.sources,
    currentConfig.sources,
    registry,
  );
  if (sourcesResult.removed.length > 0) {
    warnings.push(
      `Ignored unavailable sources: ${sourcesResult.removed.join(", ")}.`,
    );
  }

  const config: PipelineSearchPresetConfig = {
    searchTerms:
      searchTerms.length > 0 ? searchTerms : currentConfig.searchTerms,
    sources: sourcesResult.sources,
    country: normalizeCountry(candidate?.country, currentConfig.country),
    cityLocations: normalizeOptionalStrings(
      candidate?.cityLocations,
      currentConfig.cityLocations,
      25,
      100,
    ),
    workplaceTypes,
    searchScope: normalizeLocationSearchScope(
      candidate?.searchScope ?? currentConfig.searchScope,
    ),
    matchStrictness: normalizeLocationMatchStrictness(
      candidate?.matchStrictness ?? currentConfig.matchStrictness,
    ),
    topN: clampNumber(candidate?.topN, 1, 50, currentConfig.topN),
    minSuitabilityScore: clampNumber(
      candidate?.minSuitabilityScore,
      0,
      100,
      currentConfig.minSuitabilityScore,
    ),
    runBudget: clampNumber(
      candidate?.runBudget,
      MIN_RUN_BUDGET,
      MAX_RUN_BUDGET,
      currentConfig.runBudget,
    ),
    automaticPresetId: PRESET_VALUES.includes(
      candidate?.automaticPresetId as (typeof PRESET_VALUES)[number],
    )
      ? candidate?.automaticPresetId
      : "custom",
  };

  config.sources = filterCompatibleSources({ config, registry, warnings });
  return { config, warnings: warnings.slice(0, MAX_WARNINGS) };
}

function buildPrompt(args: {
  prompt: string;
  currentConfig: PipelineSearchPresetConfig;
  runtimeSources: ExtractorSourceId[];
  resumeContext: SearchTermContext | null;
}): string {
  const sourceOptions = args.runtimeSources.map((source) => ({
    id: source,
    label: EXTRACTOR_SOURCE_METADATA[source].label,
    ukOnly: Boolean(EXTRACTOR_SOURCE_METADATA[source].ukOnly),
    requiresCredentials: Boolean(
      EXTRACTOR_SOURCE_METADATA[source].requiresCredentials,
    ),
  }));

  return [
    "Convert the user's natural-language job search request into Job Ops search settings.",
    "Return only values that match the schema. Prefer current settings when the user did not specify a change.",
    "Do not start a run. Fill settings for user review.",
    "",
    "Rules:",
    "- Choose concise job-title search terms.",
    "- Keep locations in country/city fields, not in search terms.",
    "- Choose only available source ids.",
    "- Use conservative run volume unless the user asks for broad/deep search.",
    "- Add warnings for assumptions, ignored requests, or source/location caveats.",
    "",
    "Available sources:",
    JSON.stringify(sourceOptions),
    "",
    "Current settings:",
    JSON.stringify(args.currentConfig),
    "",
    "Sanitized resume snapshot:",
    JSON.stringify(args.resumeContext),
    "",
    "User request:",
    args.prompt,
  ].join("\n");
}

async function getResumeContext(): Promise<SearchTermContext | null> {
  try {
    return collectSearchTermContext(await getProfile());
  } catch {
    return null;
  }
}

function fallbackResponse(args: {
  currentConfig: PipelineSearchPresetConfig;
  registry: ExtractorRegistry;
  warning: string;
}): PipelineSearchPlanResponse {
  const normalized = normalizePipelineSearchPlanConfig({
    candidate: args.currentConfig,
    currentConfig: args.currentConfig,
    registry: args.registry,
    initialWarnings: [args.warning],
  });
  return {
    config: normalized.config,
    summary:
      "Search settings were left unchanged because AI planning was unavailable.",
    warnings: normalized.warnings,
    source: "fallback",
  };
}

export async function planPipelineSearch(
  input: PipelineSearchPlanRequest,
): Promise<PipelineSearchPlanResponse> {
  const registry = await getExtractorRegistry();
  const runtimeSources = PIPELINE_EXTRACTOR_SOURCE_IDS.filter((source) =>
    registry.manifestBySource.has(source),
  );

  if (runtimeSources.length === 0) {
    return fallbackResponse({
      currentConfig: input.currentConfig,
      registry,
      warning: "No runtime search sources are available.",
    });
  }

  const resumeContext = await getResumeContext();

  try {
    const model = await resolveLlmModel("tailoring");
    const llm = await createConfiguredLlmService("tailoring");
    const result = await llm.callJson<SearchPlanModelResponse>({
      model,
      messages: [
        {
          role: "user",
          content: buildPrompt({
            prompt: input.prompt,
            currentConfig: input.currentConfig,
            runtimeSources,
            resumeContext,
          }),
        },
      ],
      jsonSchema: SEARCH_PLAN_SCHEMA,
    });

    if (!result.success) {
      logger.warn(
        "Pipeline search planning fell back after AI generation failed",
        {
          route: "POST /api/pipeline/search-plan",
          error: result.error,
        },
      );
      return fallbackResponse({
        currentConfig: input.currentConfig,
        registry,
        warning:
          "AI planning was unavailable, so the current settings were kept.",
      });
    }

    const normalized = normalizePipelineSearchPlanConfig({
      candidate: result.data?.config,
      currentConfig: input.currentConfig,
      registry,
      initialWarnings: normalizeWarnings(result.data?.warnings),
    });

    return {
      config: normalized.config,
      summary: normalizeSummary(result.data?.summary, "ai"),
      warnings: normalized.warnings,
      source: "ai",
    };
  } catch (error) {
    logger.warn("Pipeline search planning fell back after unexpected error", {
      route: "POST /api/pipeline/search-plan",
      error,
    });
    return fallbackResponse({
      currentConfig: input.currentConfig,
      registry,
      warning: "AI planning failed, so the current settings were kept.",
    });
  }
}
