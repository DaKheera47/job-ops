import * as settingsRepo from "@server/repositories/settings";
import { matchJobLocationIntent } from "@shared/job-matching.js";
import { createLocationIntentFromLegacyInputs } from "@shared/location-domain.js";
import { resolveSearchCities } from "@shared/search-cities.js";
import type { PipelineConfig } from "@shared/types";
import type { ScoredJob } from "./types";

function parseWorkplaceTypes(
  raw: string | undefined,
): Array<"remote" | "hybrid" | "onsite"> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is "remote" | "hybrid" | "onsite" =>
        value === "remote" || value === "hybrid" || value === "onsite",
    );
  } catch {
    return [];
  }
}

async function resolveLocationIntent(
  mergedConfig: PipelineConfig,
): Promise<NonNullable<PipelineConfig["locationIntent"]>> {
  if (mergedConfig.locationIntent) return mergedConfig.locationIntent;

  const settings = await settingsRepo.getAllSettings();
  return createLocationIntentFromLegacyInputs({
    selectedCountry: settings.jobspyCountryIndeed ?? "",
    cityLocations: resolveSearchCities({
      single: settings.searchCities ?? settings.jobspyLocation ?? null,
    }),
    workplaceTypes: parseWorkplaceTypes(settings.workplaceTypes),
    geoScope: settings.locationSearchScope ?? null,
    matchStrictness: settings.locationMatchStrictness ?? null,
  });
}

export async function selectJobsStep(args: {
  scoredJobs: ScoredJob[];
  mergedConfig: PipelineConfig;
}): Promise<ScoredJob[]> {
  const locationIntent = await resolveLocationIntent(args.mergedConfig);
  const prioritizeSelectedLocations =
    locationIntent.geoScope === "remote_worldwide_prioritize_selected";

  return args.scoredJobs
    .filter(
      (job) =>
        (job.suitabilityScore ?? 0) >= args.mergedConfig.minSuitabilityScore,
    )
    .sort((left, right) => {
      const scoreDelta =
        (right.suitabilityScore ?? 0) - (left.suitabilityScore ?? 0);
      if (scoreDelta !== 0) return scoreDelta;
      if (!prioritizeSelectedLocations) return 0;

      const leftPriority = matchJobLocationIntent(
        left,
        locationIntent,
      ).priority;
      const rightPriority = matchJobLocationIntent(
        right,
        locationIntent,
      ).priority;
      return rightPriority - leftPriority;
    })
    .slice(0, args.mergedConfig.topN);
}
