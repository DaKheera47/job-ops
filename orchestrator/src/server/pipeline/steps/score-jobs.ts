import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import * as settingsRepo from "@server/repositories/settings";
import { assessJobLegitimacy } from "@server/services/ghost-job-detector";
import { scoreJobSuitability } from "@server/services/scorer";
import * as visaSponsors from "@server/services/visa-sponsors/index";
import { asyncPool } from "@server/utils/async-pool";
import type { Job } from "@shared/types";
import { progressHelpers, updateProgress } from "../progress";
import type { ScoredJob } from "./types";

// Anthropic API accepts ~10+ parallel requests comfortably for an Intel
// GNAI account.  Bumping from 4 → 8 cuts scoring wall-time roughly in half
// with no quality impact (each call is independent).
const SCORING_CONCURRENCY = 8;

export async function scoreJobsStep(args: {
  profile: Record<string, unknown>;
  shouldCancel?: () => boolean;
}): Promise<{
  unprocessedJobs: Job[];
  scoredJobs: ScoredJob[];
  autoSkipped: number;
  ghostFlagged: number;
  deferredCount: number;
}> {
  logger.info("Running scoring step");

  // Hard cost cap — newest jobs win, rest stay in `discovered` and get
  // picked up by the next run.  Pulled from settings so the user can tune
  // it without redeploying.
  const maxToScoreRaw = await settingsRepo.getSetting(
    "pipelineMaxJobsToScore",
  );
  const maxToScore = maxToScoreRaw
    ? Math.max(1, parseInt(maxToScoreRaw, 10))
    : 2000;
  // Fetch up to maxToScore+1 so we can detect whether the queue was capped
  // (i.e. there were strictly more eligible jobs than we are going to score).
  const sampled = await jobsRepo.getUnscoredDiscoveredJobs(maxToScore + 1);
  const queueWasCapped = sampled.length > maxToScore;
  const unprocessedJobs = queueWasCapped ? sampled.slice(0, maxToScore) : sampled;
  const deferredCount = queueWasCapped ? sampled.length - maxToScore : 0;

  if (queueWasCapped) {
    logger.info("Scoring queue capped by pipelineMaxJobsToScore", {
      capacity: maxToScore,
      sampled: sampled.length,
      deferredCount,
    });
  }

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
  let completed = 0;
  let autoSkipped = 0;
  let ghostFlagged = 0;

  await asyncPool({
    items: unprocessedJobs,
    concurrency: SCORING_CONCURRENCY,
    shouldStop: args.shouldCancel,
    task: async (job) => {
      if (args.shouldCancel?.()) return;

      const hasCachedScore =
        typeof job.suitabilityScore === "number" &&
        !Number.isNaN(job.suitabilityScore);

      if (hasCachedScore) {
        completed += 1;
        progressHelpers.scoringJob(
          completed,
          unprocessedJobs.length,
          `${job.title} (cached)`,
        );
        scoredJobs.push({
          ...job,
          suitabilityScore: job.suitabilityScore as number,
          suitabilityReason: job.suitabilityReason ?? "",
        });
        return;
      }

      const { score, reason, matchAnalysis } = await scoreJobSuitability(
        job,
        args.profile,
      );
      if (args.shouldCancel?.()) return;

      // Ghost-job legitimacy heuristic (cheap, no LLM call).
      const legitimacy = assessJobLegitimacy(job);
      if (legitimacy.tier === "red") ghostFlagged += 1;

      let sponsorMatchScore = 0;
      let sponsorMatchNames: string | undefined;

      if (job.employer) {
        const sponsorResults = await visaSponsors.searchSponsors(job.employer, {
          limit: 10,
          minScore: 50,
        });

        const summary =
          visaSponsors.calculateSponsorMatchSummary(sponsorResults);
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
        ...(matchAnalysis ? { matchAnalysis } : {}),
        legitimacyTier: legitimacy.tier,
        legitimacyScore: legitimacy.score,
        legitimacySignals: legitimacy.signals,
        sponsorMatchScore,
        sponsorMatchNames,
        ...(shouldAutoSkip ? { status: "skipped" } : {}),
      });

      if (shouldAutoSkip) {
        autoSkipped += 1;
        logger.info("Auto-skipped job due to low score", {
          jobId: job.id,
          title: job.title,
          score,
          threshold: autoSkipThreshold,
        });
      }

      completed += 1;
      progressHelpers.scoringJob(completed, unprocessedJobs.length, job.title);
      scoredJobs.push({
        ...job,
        suitabilityScore: score,
        suitabilityReason: reason,
      });
    },
  });

  progressHelpers.scoringComplete(scoredJobs.length);
  logger.info("Scoring step completed", {
    scoredJobs: scoredJobs.length,
    autoSkipped,
    ghostFlagged,
    deferredCount,
    concurrency: SCORING_CONCURRENCY,
  });

  return { unprocessedJobs, scoredJobs, autoSkipped, ghostFlagged, deferredCount };
}
