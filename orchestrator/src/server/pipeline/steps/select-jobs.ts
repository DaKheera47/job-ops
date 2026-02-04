import type { PipelineConfig } from "@shared/types";
import type { ScoredJob } from "./types";

export function selectJobsStep(args: {
  scoredJobs: ScoredJob[];
  mergedConfig: PipelineConfig;
}): ScoredJob[] {
  return args.scoredJobs
    .filter(
      (job) =>
        (job.suitabilityScore ?? 0) >= args.mergedConfig.minSuitabilityScore,
    )
    .sort(
      (left, right) =>
        (right.suitabilityScore ?? 0) - (left.suitabilityScore ?? 0),
    )
    .slice(0, args.mergedConfig.topN);
}
