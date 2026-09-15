import { resolveSearchCities } from "job-ops-shared/search-cities";
import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "job-ops-shared/types/extractors";
import { runUpwork } from "./src/run";

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
      detail: `Upwork: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
    };
  }

  return {
    phase: "list",
    termsProcessed: event.termIndex,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    jobPagesEnqueued: event.jobsFoundTerm ?? 0,
    jobPagesProcessed: event.jobsFoundTerm ?? 0,
    detail: `Upwork: completed ${event.termIndex}/${event.termTotal} (${event.searchTerm}) with ${event.jobsFoundTerm ?? 0} jobs`,
  };
}

export const manifest: ExtractorManifest = {
  id: "upwork",
  displayName: "Upwork",
  providesSources: ["upwork"],
  requiredEnvVars: ["APIFY_TOKEN"],
  async run(context) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const maxJobsPerTerm = context.settings.upworkMaxJobsPerTerm
      ? parseInt(context.settings.upworkMaxJobsPerTerm, 10)
      : 50;

    const cities = resolveSearchCities({
      single: context.settings.searchCities ?? context.settings.jobspyLocation,
    });
    const location = cities[0] ?? context.selectedCountry;

    const result = await runUpwork({
      searchTerms: context.searchTerms,
      location,
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
