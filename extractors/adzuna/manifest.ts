import { getAdzunaCountryCode } from "@shared/location-support.js";
import { resolveSearchCities } from "@shared/search-cities.js";
import type {
  ExtractorManifest,
  ExtractorProgressEvent,
} from "@shared/types/extractors";
import { runAdzuna } from "./src/run";

function toProgress(event: {
  type: string;
  termIndex: number;
  termTotal: number;
  searchTerm: string;
  pageNo?: number;
  totalCollected?: number;
}): ExtractorProgressEvent {
  if (event.type === "term_start") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      currentUrl: event.searchTerm,
      detail: `Adzuna: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
    };
  }

  if (event.type === "page_fetched") {
    const pageNo = event.pageNo ?? 0;
    const totalCollected = event.totalCollected ?? 0;
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      listPagesProcessed: pageNo,
      jobPagesEnqueued: totalCollected,
      jobPagesProcessed: totalCollected,
      currentUrl: `page ${pageNo}`,
      detail: `Adzuna: term ${event.termIndex}/${event.termTotal}, page ${pageNo} (${totalCollected} collected)`,
    };
  }

  return {
    phase: "list",
    termsProcessed: event.termIndex,
    termsTotal: event.termTotal,
    currentUrl: event.searchTerm,
    detail: `Adzuna: completed term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
  };
}

export const manifest: ExtractorManifest = {
  id: "adzuna",
  displayName: "Adzuna",
  providesSources: ["adzuna"],
  requiredEnvVars: ["ADZUNA_APP_ID", "ADZUNA_APP_KEY"],
  async run(context) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const countryCode = getAdzunaCountryCode(context.selectedCountry);
    if (!countryCode) {
      return {
        success: false,
        jobs: [],
        error: `unsupported country ${context.selectedCountry}`,
      };
    }

    const maxJobsPerTerm = context.settings.adzunaMaxJobsPerTerm
      ? parseInt(context.settings.adzunaMaxJobsPerTerm, 10)
      : 50;

    let result: Awaited<ReturnType<typeof runAdzuna>>;
    try {
      result = await runAdzuna({
        country: countryCode,
        countryKey: context.selectedCountry,
        searchTerms: context.searchTerms,
        locations: resolveSearchCities({
          single:
            context.settings.searchCities ?? context.settings.jobspyLocation,
        }),
        maxJobsPerTerm,
        onProgress: (event) => {
          if (context.shouldCancel?.()) return;

          context.onProgress?.(toProgress(event));
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "Unexpected error while running Adzuna extractor.";
      return {
        success: false,
        jobs: [],
        error: message,
      };
    }

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
