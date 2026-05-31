import type {
  ExtractorManifest,
  ExtractorRuntimeContext,
} from "@shared/types/extractors";
import { runCrawler } from "./src/run";

export const manifest: ExtractorManifest = {
  id: "gradcracker",
  displayName: "Gradcracker",
  providesSources: ["gradcracker"],
  locationCapabilities: {
    gradcracker: { supportedCountryKeys: ["united kingdom"] },
  },
  async run(context: ExtractorRuntimeContext) {
    if (context.shouldCancel?.()) {
      return { success: true, jobs: [] };
    }

    const existingJobUrls = await context.getExistingJobUrls?.();
    const maxJobsPerTerm = context.settings.gradcrackerMaxJobsPerTerm
      ? parseInt(context.settings.gradcrackerMaxJobsPerTerm, 10)
      : 50;

    const result = await runCrawler({
      existingJobUrls,
      searchTerms: context.searchTerms,
      maxJobsPerTerm,
      shouldCancel: context.shouldCancel,
      onProgress: (progress) => {
        if (context.shouldCancel?.()) return;

        context.onProgress?.({
          phase: progress.phase,
          currentUrl: progress.currentUrl,
          listPagesProcessed: progress.listPagesProcessed,
          listPagesTotal: progress.listPagesTotal,
          jobCardsFound: progress.jobCardsFound,
          jobPagesEnqueued: progress.jobPagesEnqueued,
          jobPagesSkipped: progress.jobPagesSkipped,
          jobPagesProcessed: progress.jobPagesProcessed,
          detail: progress.detail,
        });
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

    // Gradcracker is a UK-only board. Its location strings are UK region names
    // (e.g. "London and South East", "North West") which don't contain "United
    // Kingdom" / "UK", so the orchestrator's country filter would drop every job
    // without an explicit country key. Stamp it here so the matcher knows.
    const jobs = result.jobs.map((job) => ({
      ...job,
      locationEvidence: {
        country: "united kingdom",
        location: job.location ?? null,
        source: "gradcracker",
      },
    }));

    return {
      success: true,
      jobs,
    };
  },
};

export default manifest;
