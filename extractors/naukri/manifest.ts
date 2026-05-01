import { resolveSearchCities } from "@shared/search-cities.js";
import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "@shared/types/extractors";
import { runNaukri } from "./src/run";

function toProgress(event: {
  type: string;
  termIndex: number;
  termTotal: number;
  searchTerm: string;
  location?: string;
  pageNo?: number;
  totalCollected?: number;
  jobsFoundTerm?: number;
}): ExtractorProgressEvent {
  const locationSuffix = event.location ? ` in ${event.location}` : "";

  if (event.type === "term_start") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      currentUrl: event.searchTerm,
      detail: `Naukri: term ${event.termIndex}/${event.termTotal} (${event.searchTerm}${locationSuffix})`,
    };
  }

  if (event.type === "page_fetched") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      listPagesProcessed: event.pageNo ?? 0,
      jobPagesEnqueued: event.totalCollected ?? 0,
      jobPagesProcessed: event.totalCollected ?? 0,
      currentUrl: `page ${event.pageNo ?? 0}`,
      detail: `Naukri: term ${event.termIndex}/${event.termTotal}, page ${event.pageNo ?? 0} (${event.totalCollected ?? 0} collected)`,
    };
  }

  return {
    phase: "list",
    termsProcessed: event.termIndex,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    detail: `Naukri: completed term ${event.termIndex}/${event.termTotal} (${event.searchTerm}${locationSuffix}) — ${event.jobsFoundTerm ?? 0} jobs`,
  };
}

export const manifest: ExtractorManifest = {
  id: "naukri",
  displayName: "Naukri",
  providesSources: ["naukri"],
  async run(context) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const maxJobsPerTerm = context.settings.naukriMaxJobsPerTerm
      ? parseInt(context.settings.naukriMaxJobsPerTerm, 10)
      : 50;
    const existingJobUrls = await context.getExistingJobUrls?.();

    const result = await runNaukri({
      searchTerms: context.searchTerms,
      locations: resolveSearchCities({
        single:
          context.settings.searchCities ?? context.settings.jobspyLocation,
      }),
      existingJobUrls,
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
        challengeRequired: result.challengeRequired,
      };
    }

    return { success: true, jobs: result.jobs };
  },
};

export default manifest;
