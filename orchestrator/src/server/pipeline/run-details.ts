import {
  formatCountryLabel,
  getCompatibleSourcesForCountry,
} from "@shared/location-support.js";
import { parseSearchCitiesSetting } from "@shared/search-cities.js";
import type {
  AppSettings,
  PipelineConfig,
  PipelineRunEffectiveConfig,
  PipelineRunExecutionStage,
  PipelineRunRequestedConfig,
  PipelineRunResultSummary,
  PipelineRunSavedDetails,
} from "@shared/types";
import { getEffectiveSettings } from "../services/settings";

export function buildRequestedConfigSnapshot(
  config: PipelineConfig,
): PipelineRunRequestedConfig {
  return {
    topN: config.topN,
    minSuitabilityScore: config.minSuitabilityScore,
    sources: [...config.sources],
    enableCrawling: config.enableCrawling !== false,
    enableScoring: config.enableScoring !== false,
    enableImporting: config.enableImporting !== false,
    enableAutoTailoring: config.enableAutoTailoring !== false,
  };
}

function buildEffectiveConfigSnapshot(args: {
  requestedConfig: PipelineRunRequestedConfig;
  settings: AppSettings;
}): PipelineRunEffectiveConfig {
  const country = args.settings.jobspyCountryIndeed.value.trim() || null;
  const compatibleSources = getCompatibleSourcesForCountry(
    args.requestedConfig.sources,
    country,
  );
  const skippedSources = args.requestedConfig.sources
    .filter((source) => !compatibleSources.includes(source))
    .map((source) => ({
      source,
      reason: country
        ? `Not available for ${formatCountryLabel(country) || country}`
        : "Not selected at runtime",
    }));

  return {
    country,
    countryLabel: country ? formatCountryLabel(country) || country : null,
    searchCities: parseSearchCitiesSetting(args.settings.searchCities.value),
    searchTermsCount: args.settings.searchTerms.value.length,
    workplaceTypes: [...args.settings.workplaceTypes.value],
    locationSearchScope: args.settings.locationSearchScope.value,
    locationMatchStrictness: args.settings.locationMatchStrictness.value,
    compatibleSources,
    skippedSources,
    blockedCompanyKeywordsCount:
      args.settings.blockedCompanyKeywords.value.length,
    sourceLimits: {
      ukvisajobsMaxJobs: args.settings.ukvisajobsMaxJobs.value,
      adzunaMaxJobsPerTerm: args.settings.adzunaMaxJobsPerTerm.value,
      gradcrackerMaxJobsPerTerm: args.settings.gradcrackerMaxJobsPerTerm.value,
      startupjobsMaxJobsPerTerm: args.settings.startupjobsMaxJobsPerTerm.value,
      jobspyResultsWanted: args.settings.jobspyResultsWanted.value,
    },
    autoSkipScoreThreshold: args.settings.autoSkipScoreThreshold.value,
    pdfRenderer: args.settings.pdfRenderer.value,
    models: {
      scorer: args.settings.modelScorer.value,
      tailoring: args.settings.modelTailoring.value,
      projectSelection: args.settings.modelProjectSelection.value,
    },
    resumeProjects: {
      maxProjects: args.settings.resumeProjects.value.maxProjects,
      lockedProjectCount:
        args.settings.resumeProjects.value.lockedProjectIds.length,
      aiSelectableProjectCount:
        args.settings.resumeProjects.value.aiSelectableProjectIds.length,
    },
  };
}

export async function buildPipelineRunSavedDetails(
  config: PipelineConfig,
): Promise<PipelineRunSavedDetails> {
  const requestedConfig = buildRequestedConfigSnapshot(config);
  const settings = await getEffectiveSettings();

  return {
    requestedConfig,
    effectiveConfig: buildEffectiveConfigSnapshot({
      requestedConfig,
      settings,
    }),
    resultSummary: createPipelineRunResultSummary(),
  };
}

export function createPipelineRunResultSummary(
  overrides: Partial<PipelineRunResultSummary> = {},
): PipelineRunResultSummary {
  return {
    stage: "started",
    jobsScored: null,
    jobsSelected: null,
    sourceErrors: [],
    ...overrides,
  };
}

export function updatePipelineRunResultSummary(
  current: PipelineRunResultSummary | null | undefined,
  update: Partial<PipelineRunResultSummary> & {
    stage?: PipelineRunExecutionStage;
  },
): PipelineRunResultSummary {
  return {
    ...createPipelineRunResultSummary(),
    ...(current ?? {}),
    ...update,
  };
}
