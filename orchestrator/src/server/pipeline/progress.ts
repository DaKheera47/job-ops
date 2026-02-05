import { logger } from "@infra/logger";

/**
 * Pipeline progress tracking with Server-Sent Events.
 */

export type PipelineStep =
  | "idle"
  | "crawling"
  | "importing"
  | "scoring"
  | "processing"
  | "completed"
  | "failed";

export interface PipelineProgress {
  step: PipelineStep;
  message: string;
  detail?: string;
  crawlingListPagesProcessed: number;
  crawlingListPagesTotal: number;
  crawlingJobCardsFound: number;
  crawlingJobPagesEnqueued: number;
  crawlingJobPagesSkipped: number;
  crawlingJobPagesProcessed: number;
  crawlingPhase?: "list" | "job";
  crawlingCurrentUrl?: string;
  jobsDiscovered: number;
  jobsScored: number;
  jobsProcessed: number;
  totalToProcess: number;
  currentJob?: {
    id: string;
    title: string;
    employer: string;
  };
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

// Event emitter for progress updates
type ProgressListener = (progress: PipelineProgress) => void;
const listeners: Set<ProgressListener> = new Set();

let currentProgress: PipelineProgress = {
  step: "idle",
  message: "Ready",
  crawlingListPagesProcessed: 0,
  crawlingListPagesTotal: 0,
  crawlingJobCardsFound: 0,
  crawlingJobPagesEnqueued: 0,
  crawlingJobPagesSkipped: 0,
  crawlingJobPagesProcessed: 0,
  jobsDiscovered: 0,
  jobsScored: 0,
  jobsProcessed: 0,
  totalToProcess: 0,
};

/**
 * Update the current progress and notify all listeners.
 */
export function updateProgress(update: Partial<PipelineProgress>): void {
  currentProgress = { ...currentProgress, ...update };

  // Notify all listeners
  for (const listener of listeners) {
    try {
      listener(currentProgress);
    } catch (error) {
      logger.error("Error in progress listener", error);
    }
  }
}

/**
 * Get the current progress state.
 */
export function getProgress(): PipelineProgress {
  return { ...currentProgress };
}

/**
 * Subscribe to progress updates.
 */
export function subscribeToProgress(listener: ProgressListener): () => void {
  listeners.add(listener);

  // Send current state immediately
  listener(currentProgress);

  // Return unsubscribe function
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Reset progress to idle state.
 */
export function resetProgress(): void {
  currentProgress = {
    step: "idle",
    message: "Ready",
    crawlingListPagesProcessed: 0,
    crawlingListPagesTotal: 0,
    crawlingJobCardsFound: 0,
    crawlingJobPagesEnqueued: 0,
    crawlingJobPagesSkipped: 0,
    crawlingJobPagesProcessed: 0,
    crawlingPhase: undefined,
    crawlingCurrentUrl: undefined,
    jobsDiscovered: 0,
    jobsScored: 0,
    jobsProcessed: 0,
    totalToProcess: 0,
  };
}

/**
 * Helper to create progress updates for each step.
 */
export const progressHelpers = {
  startCrawling: () =>
    updateProgress({
      step: "crawling",
      message: "Fetching jobs from sources...",
      detail: "Starting crawler",
      startedAt: new Date().toISOString(),
      crawlingListPagesProcessed: 0,
      crawlingListPagesTotal: 0,
      crawlingJobCardsFound: 0,
      crawlingJobPagesEnqueued: 0,
      crawlingJobPagesSkipped: 0,
      crawlingJobPagesProcessed: 0,
      crawlingPhase: undefined,
      crawlingCurrentUrl: undefined,
      jobsDiscovered: 0,
      jobsScored: 0,
      jobsProcessed: 0,
      totalToProcess: 0,
    }),

  crawlingUpdate: (update: {
    listPagesProcessed?: number;
    listPagesTotal?: number;
    jobCardsFound?: number;
    jobPagesEnqueued?: number;
    jobPagesSkipped?: number;
    jobPagesProcessed?: number;
    phase?: "list" | "job";
    currentUrl?: string;
  }) => {
    const current = getProgress();
    const next = {
      ...current,
      crawlingListPagesProcessed:
        update.listPagesProcessed ?? current.crawlingListPagesProcessed,
      crawlingListPagesTotal:
        update.listPagesTotal ?? current.crawlingListPagesTotal,
      crawlingJobCardsFound:
        update.jobCardsFound ?? current.crawlingJobCardsFound,
      crawlingJobPagesEnqueued:
        update.jobPagesEnqueued ?? current.crawlingJobPagesEnqueued,
      crawlingJobPagesSkipped:
        update.jobPagesSkipped ?? current.crawlingJobPagesSkipped,
      crawlingJobPagesProcessed:
        update.jobPagesProcessed ?? current.crawlingJobPagesProcessed,
      crawlingPhase: update.phase ?? current.crawlingPhase,
      crawlingCurrentUrl: update.currentUrl ?? current.crawlingCurrentUrl,
    };

    const sourcesPart =
      next.crawlingListPagesTotal > 0
        ? `${next.crawlingListPagesProcessed}/${next.crawlingListPagesTotal}`
        : `${next.crawlingListPagesProcessed}`;

    const pagesPart = `${next.crawlingJobPagesProcessed}/${next.crawlingJobPagesEnqueued}`;
    const skippedPart =
      next.crawlingJobPagesSkipped > 0
        ? `, skipped ${next.crawlingJobPagesSkipped}`
        : "";
    const cardsPart =
      next.crawlingJobCardsFound > 0
        ? `, cards ${next.crawlingJobCardsFound}`
        : "";

    const message = `Crawling jobs (${sourcesPart} sources, pages ${pagesPart}${skippedPart}${cardsPart})...`;
    const detail =
      next.crawlingCurrentUrl && next.crawlingPhase
        ? `${next.crawlingPhase === "list" ? "List" : "Job"}: ${next.crawlingCurrentUrl}`
        : next.crawlingCurrentUrl
          ? next.crawlingCurrentUrl
          : "Running crawler";

    updateProgress({
      step: "crawling",
      message,
      detail,
      crawlingListPagesProcessed: next.crawlingListPagesProcessed,
      crawlingListPagesTotal: next.crawlingListPagesTotal,
      crawlingJobCardsFound: next.crawlingJobCardsFound,
      crawlingJobPagesEnqueued: next.crawlingJobPagesEnqueued,
      crawlingJobPagesSkipped: next.crawlingJobPagesSkipped,
      crawlingJobPagesProcessed: next.crawlingJobPagesProcessed,
      crawlingPhase: next.crawlingPhase,
      crawlingCurrentUrl: next.crawlingCurrentUrl,
    });
  },

  crawlingComplete: (jobsFound: number) =>
    updateProgress({
      step: "importing",
      message: `Found ${jobsFound} jobs, importing to database...`,
      detail: "Deduplicating and saving",
      jobsDiscovered: jobsFound,
      crawlingCurrentUrl: undefined,
    }),

  importComplete: (created: number, skipped: number) =>
    updateProgress({
      step: "scoring",
      message: `Imported ${created} new jobs (${skipped} duplicates). Scoring...`,
      detail: "Using AI to evaluate job fit",
    }),

  scoringJob: (index: number, total: number, title: string) =>
    updateProgress({
      step: "scoring",
      message: `Scoring jobs (${index}/${total})...`,
      detail: title,
      jobsScored: index,
    }),

  scoringComplete: (totalScored: number) =>
    updateProgress({
      step: "scoring",
      message: `Scored ${totalScored} jobs.`,
      detail: "Ready for manual processing",
      jobsScored: totalScored,
      totalToProcess: 0,
      jobsProcessed: 0,
      currentJob: undefined,
    }),

  processingJob: (
    index: number,
    total: number,
    job: { id: string; title: string; employer: string },
  ) =>
    updateProgress({
      step: "processing",
      message: `Processing job ${index}/${total}...`,
      detail: `${job.title} @ ${job.employer}`,
      jobsProcessed: index - 1,
      totalToProcess: total,
      currentJob: job,
    }),

  generatingSummary: (job: { title: string; employer: string }) =>
    updateProgress({
      detail: `Generating summary for ${job.title}...`,
    }),

  generatingPdf: (job: { title: string; employer: string }) =>
    updateProgress({
      detail: `Generating PDF for ${job.title}...`,
    }),

  jobComplete: (index: number, total: number) =>
    updateProgress({
      jobsProcessed: index,
      detail: `Completed ${index}/${total} jobs`,
    }),

  complete: (discovered: number, processed: number) =>
    updateProgress({
      step: "completed",
      message: `Pipeline complete! Discovered ${discovered} jobs, processed ${processed}.`,
      detail: "Ready for review",
      completedAt: new Date().toISOString(),
      currentJob: undefined,
    }),

  failed: (error: string) =>
    updateProgress({
      step: "failed",
      message: "Pipeline failed",
      detail: error,
      error,
      completedAt: new Date().toISOString(),
    }),
};
