import type {
  ExtractorManifest,
  ExtractorProgressEvent,
  ExtractorRuntimeContext,
} from "@shared/types/extractors";
import { runUkVisaJobs } from "./src/run";

function toProgress(event: {
  type: string;
  termIndex: number;
  termTotal: number;
  searchTerm: string;
  pageNo?: number;
  maxPages?: number;
  totalCollected?: number;
  message?: string;
}): ExtractorProgressEvent {
  if (event.type === "init") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      listPagesProcessed: 0,
      listPagesTotal: event.maxPages ?? 0,
      currentUrl: event.searchTerm || "all jobs",
      detail: `UKVisaJobs: term ${event.termIndex}/${event.termTotal} (${event.searchTerm || "all jobs"})`,
    };
  }

  if (event.type === "page_fetched") {
    return {
      phase: "list",
      termsProcessed: Math.max(event.termIndex - 1, 0),
      termsTotal: event.termTotal,
      listPagesProcessed: event.pageNo ?? 0,
      listPagesTotal: event.maxPages ?? 0,
      jobPagesEnqueued: event.totalCollected ?? 0,
      jobPagesProcessed: event.totalCollected ?? 0,
      currentUrl: `page ${event.pageNo ?? 0}/${event.maxPages ?? 0}`,
      detail: `UKVisaJobs: term ${event.termIndex}/${event.termTotal}, page ${event.pageNo ?? 0}/${event.maxPages ?? 0} (${event.totalCollected ?? 0} collected)`,
    };
  }

  if (event.type === "term_complete") {
    return {
      phase: "list",
      termsProcessed: event.termIndex,
      termsTotal: event.termTotal,
      currentUrl: event.searchTerm || "all jobs",
      detail: `UKVisaJobs: completed term ${event.termIndex}/${event.termTotal} (${event.searchTerm || "all jobs"})`,
    };
  }

  if (event.type === "empty_page") {
    return {
      detail: `UKVisaJobs: page ${event.pageNo ?? 0} returned no jobs`,
    };
  }

  return {
    detail: `UKVisaJobs: ${event.message ?? "unknown event"}`,
  };
}

export const manifest: ExtractorManifest = {
  id: "ukvisajobs",
  displayName: "UK Visa Jobs",
  providesSources: ["ukvisajobs"],
  requiredEnvVars: ["UKVISAJOBS_EMAIL", "UKVISAJOBS_PASSWORD"],
  async run(context: ExtractorRuntimeContext) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const maxJobs = context.settings.ukvisajobsMaxJobs
      ? parseInt(context.settings.ukvisajobsMaxJobs, 10)
      : 50;

    const result = await runUkVisaJobs({
      maxJobs,
      searchTerms: context.searchTerms,
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
