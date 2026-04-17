import * as settingsRepo from "@server/repositories/settings";
import { normalizeLocationSearchScope } from "@shared/location-preferences.js";
import {
  matchesRequestedCity,
  matchesRequestedCountry,
  resolveSearchCities,
  shouldApplyStrictCityFilter,
} from "@shared/search-cities.js";
import type { PipelineConfig } from "@shared/types";
import type { ScoredJob } from "./types";

function matchesSelectedLocations(args: {
  job: ScoredJob;
  selectedCountry: string;
  requestedCities: string[];
}): boolean {
  const { job, selectedCountry, requestedCities } = args;
  if (!selectedCountry) return false;

  const countryMatches = matchesRequestedCountry(
    job.location ?? undefined,
    selectedCountry,
  );
  if (!countryMatches) return false;
  if (requestedCities.length === 0) return true;

  return requestedCities.some((requestedCity) => {
    const strict = shouldApplyStrictCityFilter(requestedCity, selectedCountry);
    if (!strict) return true;
    return matchesRequestedCity(job.location ?? undefined, requestedCity);
  });
}

export async function selectJobsStep(args: {
  scoredJobs: ScoredJob[];
  mergedConfig: PipelineConfig;
}): Promise<ScoredJob[]> {
  const settings = await settingsRepo.getAllSettings();
  const searchScope = normalizeLocationSearchScope(
    settings.locationSearchScope,
  );
  const selectedCountry = settings.jobspyCountryIndeed ?? "";
  const requestedCities = resolveSearchCities({
    single: settings.searchCities ?? settings.jobspyLocation,
  });
  const prioritizeSelectedLocations =
    searchScope === "remote_worldwide_prioritize_selected";

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

      const leftPriority = matchesSelectedLocations({
        job: left,
        selectedCountry,
        requestedCities,
      })
        ? 1
        : 0;
      const rightPriority = matchesSelectedLocations({
        job: right,
        selectedCountry,
        requestedCities,
      })
        ? 1
        : 0;
      return rightPriority - leftPriority;
    })
    .slice(0, args.mergedConfig.topN);
}
