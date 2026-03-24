import { resolveSearchCities } from "@shared/search-cities.js";
import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "@shared/types/extractors";
import { runWorkingNomads } from "./run";

function toProgress(event: {
  type: string;
  termIndex: number;
  termTotal: number;
  searchTerm: string;
  jobsFoundTerm?: number;
}): ExtractorProgressEvent {
  if (event.type === "term_start") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      currentUrl: event.searchTerm,
      detail: `Working Nomads: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
    };
  }

  return {
    phase: "list",
    termsProcessed: event.termIndex,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    jobPagesEnqueued: event.jobsFoundTerm ?? 0,
    jobPagesProcessed: event.jobsFoundTerm ?? 0,
    detail: `Working Nomads: completed ${event.termIndex}/${event.termTotal} (${event.searchTerm}) with ${event.jobsFoundTerm ?? 0} jobs`,
  };
}

export const manifest: ExtractorManifest = {
  id: "workingnomads",
  displayName: "Working Nomads",
  providesSources: ["workingnomads"],
  async run(context) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const parsedMaxJobsPerTerm = context.settings.jobspyResultsWanted
      ? Number.parseInt(context.settings.jobspyResultsWanted, 10)
      : Number.NaN;
    const maxJobsPerTerm = Number.isFinite(parsedMaxJobsPerTerm)
      ? Math.max(1, parsedMaxJobsPerTerm)
      : 50;

    const result = await runWorkingNomads({
      selectedCountry: context.selectedCountry,
      searchTerms: context.searchTerms,
      locations: resolveSearchCities({
        single:
          context.settings.searchCities ?? context.settings.jobspyLocation,
      }),
      workplaceTypes: context.settings.workplaceTypes
        ? JSON.parse(context.settings.workplaceTypes)
        : undefined,
      maxJobsPerTerm,
      shouldCancel: context.shouldCancel,
      onProgress: (event) => {
        if (context.shouldCancel?.()) return;
        context.onProgress?.(toProgress(event));
      },
    });

    if (!result.success) {
      return {
        success: false,
        jobs: [],
        error: result.error,
      };
    }

    return {
      success: true,
      jobs: result.jobs,
    };
  },
};

export default manifest;
