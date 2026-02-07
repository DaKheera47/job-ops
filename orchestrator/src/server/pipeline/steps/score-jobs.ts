import { logger } from "@infra/logger";
import type { Job } from "@shared/types";
import * as jobsRepo from "../../repositories/jobs";
import * as settingsRepo from "../../repositories/settings";
import { scoreJobSuitability } from "../../services/scorer";
import * as visaSponsors from "../../services/visa-sponsors/index";
import { progressHelpers, updateProgress } from "../progress";
import type { ScoredJob } from "./types";

export async function scoreJobsStep(args: {
  profile: Record<string, unknown>;
  shouldCancel?: () => boolean;
}): Promise<{ unprocessedJobs: Job[]; scoredJobs: ScoredJob[] }> {
  logger.info("Running scoring step");
  const unprocessedJobs = await jobsRepo.getUnscoredDiscoveredJobs();

  // Check if auto-skip threshold is configured
  const autoSkipThresholdRaw = await settingsRepo.getSetting(
    "autoSkipScoreThreshold",
  );
  const autoSkipThreshold = autoSkipThresholdRaw
    ? parseInt(autoSkipThresholdRaw, 10)
    : null;

  updateProgress({
    step: "scoring",
    jobsDiscovered: unprocessedJobs.length,
    jobsScored: 0,
    jobsProcessed: 0,
    totalToProcess: 0,
    currentJob: undefined,
  });

  const scoredJobs: ScoredJob[] = [];

  for (let i = 0; i < unprocessedJobs.length; i++) {
    if (args.shouldCancel?.()) break;

    const job = unprocessedJobs[i];
    const hasCachedScore =
      typeof job.suitabilityScore === "number" &&
      !Number.isNaN(job.suitabilityScore);

    progressHelpers.scoringJob(
      i + 1,
      unprocessedJobs.length,
      hasCachedScore ? `${job.title} (cached)` : job.title,
    );

    if (hasCachedScore) {
      scoredJobs.push({
        ...job,
        suitabilityScore: job.suitabilityScore as number,
        suitabilityReason: job.suitabilityReason ?? "",
      });
      continue;
    }

    const { score, reason } = await scoreJobSuitability(job, args.profile);
    scoredJobs.push({
      ...job,
      suitabilityScore: score,
      suitabilityReason: reason,
    });

    let sponsorMatchScore = 0;
    let sponsorMatchNames: string | undefined;

    if (job.employer) {
      const sponsorResults = visaSponsors.searchSponsors(job.employer, {
        limit: 10,
        minScore: 50,
      });

      const summary = visaSponsors.calculateSponsorMatchSummary(sponsorResults);
      sponsorMatchScore = summary.sponsorMatchScore;
      sponsorMatchNames = summary.sponsorMatchNames ?? undefined;
    }

    // Check if job should be auto-skipped based on score threshold
    const shouldAutoSkip =
      job.status !== "applied" &&
      autoSkipThreshold !== null &&
      !Number.isNaN(autoSkipThreshold) &&
      score < autoSkipThreshold;

    await jobsRepo.updateJob(job.id, {
      suitabilityScore: score,
      suitabilityReason: reason,
      sponsorMatchScore,
      sponsorMatchNames,
      ...(shouldAutoSkip ? { status: "skipped" } : {}),
    });

    if (shouldAutoSkip) {
      logger.info("Auto-skipped job due to low score", {
        jobId: job.id,
        title: job.title,
        score,
        threshold: autoSkipThreshold,
      });
    }
  }

  progressHelpers.scoringComplete(scoredJobs.length);
  logger.info("Scoring step completed", { scoredJobs: scoredJobs.length });

  return { unprocessedJobs, scoredJobs };
}
