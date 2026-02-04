import type { CreateJobInput, Job, PipelineConfig } from "@shared/types";

export type ScoredJob = Job & {
  suitabilityScore: number;
  suitabilityReason: string;
};

export type RunPipelineContext = {
  mergedConfig: PipelineConfig;
  profile: Record<string, unknown>;
  discoveredJobs: CreateJobInput[];
  sourceErrors: string[];
  created: number;
  skipped: number;
  unprocessedJobs: Job[];
  scoredJobs: ScoredJob[];
  jobsToProcess: ScoredJob[];
  processedCount: number;
};
