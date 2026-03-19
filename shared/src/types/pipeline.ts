import type { ExtractorSourceId } from "../extractors";
import type {
  LocationMatchStrictness,
  LocationSearchScope,
} from "../location-preferences";
import type { Job, JobStatus } from "./jobs";
import type { LocationIntent } from "./location";
import type { PdfRenderer } from "./settings";

export interface PipelineConfig {
  topN: number; // Number of top jobs to process
  minSuitabilityScore: number; // Minimum score to auto-process
  sources: ExtractorSourceId[]; // Job sources to crawl
  outputDir: string; // Directory for generated PDFs
  locationIntent?: LocationIntent;
  enableCrawling?: boolean;
  enableScoring?: boolean;
  enableImporting?: boolean;
  enableAutoTailoring?: boolean;
}

export interface PipelineRunConfigSnapshot {
  topN: number;
  minSuitabilityScore: number;
  sources: ExtractorSourceId[];
  locationIntent: LocationIntent;
}

export interface PipelineRun {
  id: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed" | "cancelled";
  jobsDiscovered: number;
  jobsProcessed: number;
  errorMessage: string | null;
  configSnapshot?: PipelineRunConfigSnapshot | null;
}

export type PipelineRunExecutionStage =
  | "started"
  | "profile_loaded"
  | "discovery"
  | "import"
  | "scoring"
  | "selection"
  | "processing"
  | "completed";

export interface PipelineRunRequestedConfig {
  topN: number;
  minSuitabilityScore: number;
  sources: ExtractorSourceId[];
  enableCrawling: boolean;
  enableScoring: boolean;
  enableImporting: boolean;
  enableAutoTailoring: boolean;
}

export interface PipelineRunSourceLimitSnapshot {
  ukvisajobsMaxJobs: number;
  adzunaMaxJobsPerTerm: number;
  gradcrackerMaxJobsPerTerm: number;
  startupjobsMaxJobsPerTerm: number;
  jobspyResultsWanted: number;
}

export interface PipelineRunModelSnapshot {
  scorer: string;
  tailoring: string;
  projectSelection: string;
}

export interface PipelineRunResumeProjectsSnapshot {
  maxProjects: number;
  lockedProjectCount: number;
  aiSelectableProjectCount: number;
}

export interface PipelineRunSkippedSource {
  source: ExtractorSourceId;
  reason: string;
}

export interface PipelineRunEffectiveConfig {
  country: string | null;
  countryLabel: string | null;
  searchCities: string[];
  searchTermsCount: number;
  workplaceTypes: Array<"remote" | "hybrid" | "onsite">;
  locationSearchScope: LocationSearchScope;
  locationMatchStrictness: LocationMatchStrictness;
  compatibleSources: ExtractorSourceId[];
  skippedSources: PipelineRunSkippedSource[];
  blockedCompanyKeywordsCount: number;
  sourceLimits: PipelineRunSourceLimitSnapshot;
  autoSkipScoreThreshold: number | null;
  pdfRenderer: PdfRenderer;
  models: PipelineRunModelSnapshot;
  resumeProjects: PipelineRunResumeProjectsSnapshot;
}

export interface PipelineRunResultSummary {
  stage: PipelineRunExecutionStage;
  jobsScored: number | null;
  jobsSelected: number | null;
  sourceErrors: string[];
}

export interface PipelineRunSavedDetails {
  requestedConfig: PipelineRunRequestedConfig;
  effectiveConfig: PipelineRunEffectiveConfig;
  resultSummary: PipelineRunResultSummary;
}

export interface PipelineStatusResponse {
  isRunning: boolean;
  lastRun: PipelineRun | null;
  nextScheduledRun: string | null;
}

export type PipelineProgressStep =
  | "idle"
  | "crawling"
  | "challenge_required"
  | "importing"
  | "scoring"
  | "processing"
  | "completed"
  | "cancelled"
  | "failed";

export interface PipelineProgressCurrentJob {
  id: string;
  title: string;
  employer: string;
}

export interface PipelinePendingChallenge {
  extractorId: string;
  extractorName: string;
  url: string;
  sources: ExtractorSourceId[];
}

export interface PipelineProgressState {
  step: PipelineProgressStep;
  message: string;
  detail?: string;
  pendingChallenges?: PipelinePendingChallenge[];
  crawlingSource: string | null;
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
  currentJob?: PipelineProgressCurrentJob;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export type PipelineMetricQuality =
  | "exact"
  | "inferred_from_timestamps"
  | "unavailable";

export interface PipelineRunMetric<T = number | null> {
  value: T;
  quality: PipelineMetricQuality;
}

export interface PipelineRunInsights {
  run: PipelineRun;
  exactMetrics: {
    durationMs: number | null;
  };
  savedDetails: PipelineRunSavedDetails | null;
  inferredMetrics: {
    jobsCreated: PipelineRunMetric<number | null>;
    jobsUpdated: PipelineRunMetric<number | null>;
    jobsProcessed: PipelineRunMetric<number | null>;
  };
}

export interface JobsListResponse<TJob = Job> {
  jobs: TJob[];
  total: number;
  byStatus: Record<JobStatus, number>;
  revision: string;
}

export interface JobsRevisionResponse {
  revision: string;
  latestUpdatedAt: string | null;
  total: number;
  statusFilter: string | null;
}

export type JobAction = "skip" | "move_to_ready" | "rescore";

export type JobActionRequest =
  | {
      action: "skip" | "rescore";
      jobIds: string[];
    }
  | {
      action: "move_to_ready";
      jobIds: string[];
      options?: {
        force?: boolean;
      };
    };

export type JobActionResult =
  | {
      jobId: string;
      ok: true;
      job: Job;
    }
  | {
      jobId: string;
      ok: false;
      error: {
        code: string;
        message: string;
      };
    };

export interface JobActionResponse {
  action: JobAction;
  requested: number;
  succeeded: number;
  failed: number;
  results: JobActionResult[];
}

export type JobActionStreamEvent =
  | {
      type: "started";
      action: JobAction;
      requested: number;
      completed: number;
      succeeded: number;
      failed: number;
      requestId: string;
    }
  | {
      type: "progress";
      action: JobAction;
      requested: number;
      completed: number;
      succeeded: number;
      failed: number;
      result: JobActionResult;
      requestId: string;
    }
  | {
      type: "completed";
      action: JobAction;
      requested: number;
      completed: number;
      succeeded: number;
      failed: number;
      results: JobActionResult[];
      requestId: string;
    }
  | {
      type: "error";
      code: string;
      message: string;
      requestId: string;
    };

export interface BackupInfo {
  filename: string;
  type: "auto" | "manual";
  size: number;
  createdAt: string;
}
