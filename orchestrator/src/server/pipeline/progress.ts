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
  | "cancelled"
  | "failed";

export type CrawlSource = string;

export interface PipelineProgress {
  step: PipelineStep;
  message: string;
  detail?: string;
  crawlingSource: CrawlSource | null;
  crawlingSourcesCompleted: number;
  crawlingSourcesTotal: number;
  crawlingTermsProcessed: number;
  crawlingTermsTotal: number;
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
  crawlingSource: null,
  crawlingSourcesCompleted: 0,
  crawlingSourcesTotal: 0,
  crawlingTermsProcessed: 0,
  crawlingTermsTotal: 0,
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

const emptyCrawlingStats = {
  crawlingTermsProcessed: 0,
  crawlingTermsTotal: 0,
  crawlingListPagesProcessed: 0,
  crawlingListPagesTotal: 0,
  crawlingJobCardsFound: 0,
  crawlingJobPagesEnqueued: 0,
  crawlingJobPagesSkipped: 0,
  crawlingJobPagesProcessed: 0,
  crawlingPhase: undefined,
  crawlingCurrentUrl: undefined,
};

type SourceCrawlingStats = {
  termsProcessed: number;
  termsTotal: number;
  listPagesProcessed: number;
  listPagesTotal: number;
  jobCardsFound: number;
  jobPagesEnqueued: number;
  jobPagesSkipped: number;
  jobPagesProcessed: number;
};

const emptySourceCrawlingStats = (): SourceCrawlingStats => ({
  termsProcessed: 0,
  termsTotal: 0,
  listPagesProcessed: 0,
  listPagesTotal: 0,
  jobCardsFound: 0,
  jobPagesEnqueued: 0,
  jobPagesSkipped: 0,
  jobPagesProcessed: 0,
});

const crawlingStatsBySource = new Map<CrawlSource, SourceCrawlingStats>();

function aggregateCrawlingStats() {
  let termsProcessed = 0;
  let termsTotal = 0;
  let listPagesProcessed = 0;
  let listPagesTotal = 0;
  let jobCardsFound = 0;
  let jobPagesEnqueued = 0;
  let jobPagesSkipped = 0;
  let jobPagesProcessed = 0;

  for (const stats of crawlingStatsBySource.values()) {
    termsProcessed += stats.termsProcessed;
    termsTotal += stats.termsTotal;
    listPagesProcessed += stats.listPagesProcessed;
    listPagesTotal += stats.listPagesTotal;
    jobCardsFound += stats.jobCardsFound;
    jobPagesEnqueued += stats.jobPagesEnqueued;
    jobPagesSkipped += stats.jobPagesSkipped;
    jobPagesProcessed += stats.jobPagesProcessed;
  }

  return {
    termsProcessed,
    termsTotal,
    listPagesProcessed,
    listPagesTotal,
    jobCardsFound,
    jobPagesEnqueued,
    jobPagesSkipped,
    jobPagesProcessed,
  };
}

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
  crawlingStatsBySource.clear();
  currentProgress = {
    step: "idle",
    message: "Ready",
    crawlingSource: null,
    crawlingSourcesCompleted: 0,
    crawlingSourcesTotal: 0,
    ...emptyCrawlingStats,
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
  startCrawling: (sourcesTotal = 0) =>
    (() => {
      crawlingStatsBySource.clear();
      updateProgress({
        step: "crawling",
        message: "Fetching jobs from sources...",
        detail: "Starting crawler",
        startedAt: new Date().toISOString(),
        crawlingSource: null,
        crawlingSourcesCompleted: 0,
        crawlingSourcesTotal: sourcesTotal,
        ...emptyCrawlingStats,
        jobsDiscovered: 0,
        jobsScored: 0,
        jobsProcessed: 0,
        totalToProcess: 0,
      });
    })(),

  startSource: (
    source: CrawlSource,
    sourcesCompleted: number,
    sourcesTotal: number,
    options?: { termsTotal?: number; detail?: string },
  ) => {
    const existing =
      crawlingStatsBySource.get(source) ?? emptySourceCrawlingStats();
    crawlingStatsBySource.set(source, {
      ...emptySourceCrawlingStats(),
      termsTotal: options?.termsTotal ?? existing.termsTotal,
    });
    const aggregated = aggregateCrawlingStats();

    updateProgress({
      step: "crawling",
      message: `Fetching jobs from ${source}...`,
      detail: options?.detail,
      crawlingSource: source,
      crawlingSourcesCompleted: sourcesCompleted,
      crawlingSourcesTotal: sourcesTotal,
      crawlingTermsProcessed: aggregated.termsProcessed,
      crawlingTermsTotal: aggregated.termsTotal,
      crawlingListPagesProcessed: aggregated.listPagesProcessed,
      crawlingListPagesTotal: aggregated.listPagesTotal,
      crawlingJobCardsFound: aggregated.jobCardsFound,
      crawlingJobPagesEnqueued: aggregated.jobPagesEnqueued,
      crawlingJobPagesSkipped: aggregated.jobPagesSkipped,
      crawlingJobPagesProcessed: aggregated.jobPagesProcessed,
      crawlingPhase: undefined,
      crawlingCurrentUrl: undefined,
    });
  },

  completeSource: (sourcesCompleted: number, sourcesTotal: number) =>
    updateProgress({
      crawlingSourcesCompleted: sourcesCompleted,
      crawlingSourcesTotal: sourcesTotal,
      crawlingCurrentUrl: undefined,
      crawlingPhase: undefined,
    }),

  crawlingUpdate: (update: {
    source?: CrawlSource;
    termsProcessed?: number;
    termsTotal?: number;
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
    if (update.source) {
      const existing =
        crawlingStatsBySource.get(update.source) ?? emptySourceCrawlingStats();
      const nextForSource: SourceCrawlingStats = {
        termsProcessed: update.termsProcessed ?? existing.termsProcessed,
        termsTotal: update.termsTotal ?? existing.termsTotal,
        listPagesProcessed:
          update.listPagesProcessed ?? existing.listPagesProcessed,
        listPagesTotal: update.listPagesTotal ?? existing.listPagesTotal,
        jobCardsFound: update.jobCardsFound ?? existing.jobCardsFound,
        jobPagesEnqueued: update.jobPagesEnqueued ?? existing.jobPagesEnqueued,
        jobPagesSkipped: update.jobPagesSkipped ?? existing.jobPagesSkipped,
        jobPagesProcessed:
          update.jobPagesProcessed ?? existing.jobPagesProcessed,
      };
      crawlingStatsBySource.set(update.source, nextForSource);
    }

    const aggregated = aggregateCrawlingStats();
    const next = {
      ...current,
      crawlingSource: update.source ?? current.crawlingSource,
      crawlingTermsProcessed: update.source
        ? aggregated.termsProcessed
        : (update.termsProcessed ?? current.crawlingTermsProcessed),
      crawlingTermsTotal: update.source
        ? aggregated.termsTotal
        : (update.termsTotal ?? current.crawlingTermsTotal),
      crawlingListPagesProcessed: update.source
        ? aggregated.listPagesProcessed
        : (update.listPagesProcessed ?? current.crawlingListPagesProcessed),
      crawlingListPagesTotal: update.source
        ? aggregated.listPagesTotal
        : (update.listPagesTotal ?? current.crawlingListPagesTotal),
      crawlingJobCardsFound: update.source
        ? aggregated.jobCardsFound
        : (update.jobCardsFound ?? current.crawlingJobCardsFound),
      crawlingJobPagesEnqueued: update.source
        ? aggregated.jobPagesEnqueued
        : (update.jobPagesEnqueued ?? current.crawlingJobPagesEnqueued),
      crawlingJobPagesSkipped: update.source
        ? aggregated.jobPagesSkipped
        : (update.jobPagesSkipped ?? current.crawlingJobPagesSkipped),
      crawlingJobPagesProcessed: update.source
        ? aggregated.jobPagesProcessed
        : (update.jobPagesProcessed ?? current.crawlingJobPagesProcessed),
      crawlingPhase: update.phase ?? current.crawlingPhase,
      crawlingCurrentUrl: update.currentUrl ?? current.crawlingCurrentUrl,
    };

    const sourcesPart =
      next.crawlingListPagesTotal > 0
        ? `${next.crawlingListPagesProcessed}/${next.crawlingListPagesTotal}`
        : `${next.crawlingListPagesProcessed}`;

    const pagesPart = `${next.crawlingJobPagesProcessed}/${next.crawlingJobPagesEnqueued}`;
    const termsPart =
      next.crawlingTermsTotal > 0
        ? `, terms ${next.crawlingTermsProcessed}/${next.crawlingTermsTotal}`
        : "";
    const skippedPart =
      next.crawlingJobPagesSkipped > 0
        ? `, skipped ${next.crawlingJobPagesSkipped}`
        : "";
    const cardsPart =
      next.crawlingJobCardsFound > 0
        ? `, cards ${next.crawlingJobCardsFound}`
        : "";

    const message = `Crawling jobs (list pages ${sourcesPart}, job pages ${pagesPart}${termsPart}${skippedPart}${cardsPart})...`;
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
      crawlingSource: next.crawlingSource,
      crawlingTermsProcessed: next.crawlingTermsProcessed,
      crawlingTermsTotal: next.crawlingTermsTotal,
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
      crawlingSource: null,
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

  cancelled: (reason: string) =>
    updateProgress({
      step: "cancelled",
      message: "Pipeline cancelled",
      detail: reason,
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
