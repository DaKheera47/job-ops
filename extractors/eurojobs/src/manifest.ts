import { resolveSearchCities } from "@shared/search-cities.js";
import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "@shared/types/extractors";
import { type EuroJobsProgressEvent, runEuroJobs } from "./run";

// EuroJobs lists jobs in the EU, the EEA, the United Kingdom and Switzerland.
// "worldwide" keeps the source available when no single country is selected.
export const EUROJOBS_SUPPORTED_COUNTRY_KEYS = [
  "austria",
  "belgium",
  "bulgaria",
  "croatia",
  "cyprus",
  "czechia",
  "denmark",
  "estonia",
  "finland",
  "france",
  "germany",
  "greece",
  "hungary",
  "iceland",
  "ireland",
  "italy",
  "latvia",
  "liechtenstein",
  "lithuania",
  "luxembourg",
  "malta",
  "netherlands",
  "norway",
  "poland",
  "portugal",
  "romania",
  "slovakia",
  "slovenia",
  "spain",
  "sweden",
  "switzerland",
  "united kingdom",
  "worldwide",
] as const;

function toProgress(event: EuroJobsProgressEvent): ExtractorProgressEvent {
  const complete = event.type === "term_complete";
  return {
    phase: "list",
    termsProcessed: complete ? event.termIndex : event.termIndex - 1,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    jobPagesEnqueued: complete ? event.jobsFoundTerm : undefined,
    jobPagesProcessed: complete ? event.jobsFoundTerm : undefined,
    detail: complete
      ? `EuroJobs: completed ${event.termIndex}/${event.termTotal} (${event.searchTerm}) with ${event.jobsFoundTerm ?? 0} jobs`
      : `EuroJobs: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
  };
}

export const manifest: ExtractorManifest = {
  id: "eurojobs",
  displayName: "EuroJobs",
  providesSources: ["eurojobs"],
  locationCapabilities: {
    eurojobs: { supportedCountryKeys: EUROJOBS_SUPPORTED_COUNTRY_KEYS },
  },
  async run(context) {
    if (context.shouldCancel?.()) return { success: true, jobs: [] };

    const parsedLimit = context.settings.jobspyResultsWanted
      ? Number.parseInt(context.settings.jobspyResultsWanted, 10)
      : Number.NaN;
    const existingJobUrls = await context.getExistingJobUrls?.();
    const result = await runEuroJobs({
      searchTerms: context.searchTerms,
      selectedCountry: context.selectedCountry,
      locations: resolveSearchCities({
        list: context.sourceLocationPlan?.requestedCities,
        single:
          context.settings.searchCities ?? context.settings.jobspyLocation,
      }),
      workplaceTypes: context.settings.workplaceTypes
        ? JSON.parse(context.settings.workplaceTypes)
        : undefined,
      maxJobsPerTerm: Number.isFinite(parsedLimit) ? parsedLimit : 50,
      existingJobUrls,
      shouldCancel: context.shouldCancel,
      onProgress: (event) => {
        if (!context.shouldCancel?.()) context.onProgress?.(toProgress(event));
      },
    });

    return result.success
      ? { success: true, jobs: result.jobs }
      : { success: false, jobs: [], error: result.error };
  },
};

export default manifest;
