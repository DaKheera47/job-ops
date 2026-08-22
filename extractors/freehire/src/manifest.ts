import { resolveSearchCities } from "@shared/search-cities.js";
import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "@shared/types/extractors";
import { type FreeHireProgressEvent, runFreeHire } from "./run";

function toProgress(event: FreeHireProgressEvent): ExtractorProgressEvent {
  const complete = event.type === "term_complete";
  return {
    phase: "list",
    termsProcessed: complete ? event.termIndex : event.termIndex - 1,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    jobPagesEnqueued: complete ? event.jobsFoundTerm : undefined,
    jobPagesProcessed: complete ? event.jobsFoundTerm : undefined,
    detail: complete
      ? `FreeHire: completed ${event.termIndex}/${event.termTotal} (${event.searchTerm}) with ${event.jobsFoundTerm ?? 0} jobs`
      : `FreeHire: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
  };
}

export const manifest: ExtractorManifest = {
  id: "freehire",
  displayName: "FreeHire",
  providesSources: ["freehire"],
  locationCapabilities: {
    freehire: { supportedCountryKeys: null },
  },
  async run(context) {
    if (context.shouldCancel?.()) return { success: true, jobs: [] };

    const parsedLimit = context.settings.jobspyResultsWanted
      ? Number.parseInt(context.settings.jobspyResultsWanted, 10)
      : Number.NaN;
    const result = await runFreeHire({
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
