import { resolveSearchCities } from "@shared/search-cities.js";
import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "@shared/types/extractors";
import { runSeek } from "./src/run";

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
      detail: `Seek: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
    };
  }

  return {
    phase: "list",
    termsProcessed: event.termIndex,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    jobPagesEnqueued: event.jobsFoundTerm ?? 0,
    jobPagesProcessed: event.jobsFoundTerm ?? 0,
    detail: `Seek: completed ${event.termIndex}/${event.termTotal} (${event.searchTerm}) — ${event.jobsFoundTerm ?? 0} jobs`,
  };
}

export const manifest: ExtractorManifest = {
  id: "seek",
  displayName: "Seek",
  providesSources: ["seek"],
  requiredEnvVars: ["APIFY_TOKEN"],
  async run(context) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const maxJobsPerTerm = context.settings.seekMaxJobsPerTerm
      ? parseInt(context.settings.seekMaxJobsPerTerm, 10)
      : 50;

    const countryLabel =
      context.selectedCountry === "new zealand" ? "New Zealand" : "Australia";

    const cities = resolveSearchCities({
      single: context.settings.searchCities ?? context.settings.jobspyLocation,
    });
    const location = cities[0] ?? `All ${countryLabel}`;

    const result = await runSeek({
      searchTerms: context.searchTerms,
      location,
      country: context.selectedCountry,
      maxJobsPerTerm,
      shouldCancel: context.shouldCancel,
      onProgress: (event) => {
        if (context.shouldCancel?.()) return;
        context.onProgress?.(toProgress(event));
      },
    });

    if (!result.success) {
      return { success: false, jobs: [], error: result.error };
    }

    return { success: true, jobs: result.jobs };
  },
};

export default manifest;
