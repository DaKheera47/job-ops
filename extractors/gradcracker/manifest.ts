import type {
  ExtractorManifest,
  ExtractorRuntimeContext,
} from "@shared/types/extractors";
import { runCrawler } from "./src/run";

export const manifest: ExtractorManifest = {
  id: "gradcracker",
  displayName: "Gradcracker",
  providesSources: ["gradcracker"],
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
        });
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
