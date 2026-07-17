import type { ExtractorSourceId } from "../extractors";
import type {
  LocationMatchStrictness,
  LocationSearchScope,
} from "../location-preferences";
import type { Job, JobStatus } from "./jobs";
import type { LocationIntent } from "./location";
import type { PdfRenderer } from "./settings";

export const MIN_PIPELINE_RUN_BUDGET = 300;
export const MAX_PIPELINE_RUN_BUDGET = 1000;

export function normalizePipelineRunBudget(value: number): number {
  return Math.min(
    MAX_PIPELINE_RUN_BUDGET,
    Math.max(MIN_PIPELINE_RUN_BUDGET, Math.round(value)),
  );
}

export interface ExtractorLimits {
  jobspyResultsWanted: number;
  gradcrackerMaxJobsPerTerm: number;
  ukvisajobsMaxJobs: number;
  adzunaMaxJobsPerTerm: number;
  startupjobsMaxJobsPerTerm: number;
  workingnomadsMaxJobsPerTerm: number;
  jobindexMaxJobsPerTerm: number;
  seekMaxJobsPerTerm: number;
  naukriMaxJobsPerTerm: number;
}

export function deriveExtractorLimits(args: {
  budget: number;
  searchTerms: string[];
  sources: readonly string[];
}): ExtractorLimits {
  const budget = normalizePipelineRunBudget(args.budget);
  const termCount = Math.max(1, args.searchTerms.length);
  const perTermSources = [
    "indeed",
    "linkedin",
    "glassdoor",
    "gradcracker",
    "adzuna",
    "hiringcafe",
    "startupjobs",
    "workingnomads",
    "jobindex",
    "seek",
    "naukri",
  ] as const;
  const weightedContributors =
    perTermSources.filter((source) => args.sources.includes(source)).length *
      termCount +
    (args.sources.includes("ukvisajobs") ? 1 : 0);

  if (weightedContributors <= 0) {
    return {
      jobspyResultsWanted: budget,
      gradcrackerMaxJobsPerTerm: budget,
      ukvisajobsMaxJobs: budget,
      adzunaMaxJobsPerTerm: budget,
      startupjobsMaxJobsPerTerm: budget,
      workingnomadsMaxJobsPerTerm: budget,
      jobindexMaxJobsPerTerm: budget,
      seekMaxJobsPerTerm: budget,
      naukriMaxJobsPerTerm: budget,
    };
  }

  const perUnit = Math.max(1, Math.floor(budget / weightedContributors));
  const remainder = Math.max(0, budget - perUnit * weightedContributors);

  return {
    jobspyResultsWanted: perUnit,
    gradcrackerMaxJobsPerTerm: perUnit,
    ukvisajobsMaxJobs: Math.min(budget, perUnit + remainder),
    adzunaMaxJobsPerTerm: perUnit,
    startupjobsMaxJobsPerTerm: perUnit,
    workingnomadsMaxJobsPerTerm: perUnit,
    jobindexMaxJobsPerTerm: perUnit,
    seekMaxJobsPerTerm: perUnit,
    naukriMaxJobsPerTerm: perUnit,
  };
}

export interface PipelineConfig {
  topN: number; // Number of top jobs to process
  minSuitabilityScore: number; // Minimum score to auto-process
  sources: ExtractorSourceId[]; // Job sources to crawl
  outputDir: string; // Directory for generated PDFs
  locationIntent?: LocationIntent;
  scoringInstructions?: string;
  runBudget?: number;
  enableCrawling?: boolean;
  enableScoring?: boolean;
  enableImporting?: boolean;
  enableAutoTailoring?: boolean;
  // Per-run filter over the current user's saved Watchlist sources.
  // undefined/null = include every Watchlist source the user has saved
  // (legacy behavior pre-#621). [] = explicitly exclude all Watchlist
  // sources. Non-empty = include only those source IDs that still belong
  // to the current user; unknown IDs are dropped server-side.
  watchlistSelectedSourceIds?: string[] | null;
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
  // null = run did not constrain Watchlist (legacy / pre-#621 behavior);
  // [] = explicitly disabled all Watchlist sources;
  // non-empty = subset of the user's saved Watchlist source IDs.
  watchlistSelectedSourceIds: string[] | null;
}

export interface PipelineRunSourceLimitSnapshot {
  ukvisajobsMaxJobs: number;
  adzunaMaxJobsPerTerm: number;
  gradcrackerMaxJobsPerTerm: number;
  startupjobsMaxJobsPerTerm: number;
  naukriMaxJobsPerTerm: number;
  jobindexMaxJobsPerTerm: number;
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

export type PipelineSearchPresetMode =
  | "fast"
  | "balanced"
  | "detailed"
  | "custom";

export interface PipelineSearchPresetConfig {
  searchTerms: string[];
  sources: ExtractorSourceId[];
  country: string;
  cityLocations: string[];
  workplaceTypes: Array<"remote" | "hybrid" | "onsite">;
  searchScope: LocationSearchScope;
  matchStrictness: LocationMatchStrictness;
  topN: number;
  minSuitabilityScore: number;
  runBudget: number;
  scoringInstructions?: string;
  automaticPresetId?: PipelineSearchPresetMode;
  // Optional per-run Watchlist source selection. Omitted = legacy behavior
  // (include every Watchlist source the user has saved). See issue #621.
  watchlistSelectedSourceIds?: string[];
}

export interface PipelineSearchPreset {
  id: string;
  name: string;
  config: PipelineSearchPresetConfig;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

export interface PipelineSearchPresetsResponse {
  searches: PipelineSearchPreset[];
}

export interface CreatePipelineSearchPresetInput {
  name: string;
  config: PipelineSearchPresetConfig;
}

export interface UpdatePipelineSearchPresetInput {
  name?: string;
  config?: PipelineSearchPresetConfig;
}

export interface PipelineSearchPlanRequest {
  prompt: string;
  currentConfig: PipelineSearchPresetConfig;
}

export interface PipelineSearchPlanResponse {
  config: PipelineSearchPresetConfig;
  summary: string;
  warnings: string[];
  source: "ai" | "fallback";
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
  | "failed"
  | "configuration_required";

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

export interface PipelineFanoutRoleProgress {
  role: string;
  complete: number;
  running: number;
  queued: number;
  check: number;
}

export interface PipelineFanoutProgress {
  termCount: number;
  locationCount: number;
  sourceCount: number;
  locations: string[];
  sources: string[];
  total: number;
  capacity: number;
  results: number;
  unique: number;
  roles: PipelineFanoutRoleProgress[];
}

export interface PipelineProgressState {
  step: PipelineProgressStep;
  message: string;
  detail?: string;
  pendingChallenges?: PipelinePendingChallenge[];
  fanout?: PipelineFanoutProgress;
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
  jobsExceptional: number;
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
