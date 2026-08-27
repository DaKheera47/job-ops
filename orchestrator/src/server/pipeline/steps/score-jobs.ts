import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import * as settingsRepo from "@server/repositories/settings";
import {
  LlmNotConfiguredError,
  ScoringUnavailableError,
  scoreJobSuitability,
} from "@server/services/scorer";
import * as visaSponsors from "@server/services/visa-sponsors/index";
import { asyncPool } from "@server/utils/async-pool";
import type { Job } from "@shared/types";
import { progressHelpers, updateProgress } from "../progress";
import type { ScoredJob } from "./types";

const SCORING_CONCURRENCY = 4;

/**
 * A lone job failing transiently should not stop the run, but when this many
 * jobs have failed before anything scored at all, the AI integration is down
 * across the board (dead endpoint, missing CLI binary, hard outage) and
 * pausing for the user beats burning retries on every remaining job. With the
 * per-call retries the LLM service already performs, sporadic provider blips
 * effectively never produce this many consecutive failures.
 */
const SYSTEMIC_FAILURE_THRESHOLD = 3;

export async function scoreJobsStep(args: {
  profile: Record<string, unknown>;
  scoringInstructions?: string;
  visaSponsorCountryKey?: string | null;
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
    jobsExceptional: 0,
    jobsProcessed: 0,
    totalToProcess: 0,
    currentJob: undefined,
  });

  const scoredJobs: ScoredJob[] = [];
  let completed = 0;
  let exceptional = 0;
  let failed = 0;
  const scoringInstructions = args.scoringInstructions?.trim();

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
        if ((job.suitabilityScore as number) > 90) exceptional += 1;
        completed += 1;
        progressHelpers.scoringJob(
          completed,
          unprocessedJobs.length,
          {
            id: job.id,
            title: `${job.title} (cached)`,
            employer: job.employer,
          },
          exceptional,
        );
        scoredJobs.push({
          ...job,
          suitabilityScore: job.suitabilityScore as number,
          suitabilityReason: job.suitabilityReason ?? "",
        });
        return;
      }

      const scoringResultPromise = scoringInstructions
        ? scoreJobSuitability(job, args.profile, { scoringInstructions })
        : scoreJobSuitability(job, args.profile);
      let scoringResult: Awaited<typeof scoringResultPromise>;
      try {
        scoringResult = await scoringResultPromise;
      } catch (error) {
        // Configuration errors still abort the pool — every remaining job
        // would fail the same way until the user fixes their settings.
        if (!(error instanceof ScoringUnavailableError)) throw error;
        failed += 1;
        completed += 1;
        if (scoredJobs.length === 0 && failed >= SYSTEMIC_FAILURE_THRESHOLD) {
          throw new LlmNotConfiguredError(
            `AI scoring failed for the first ${failed} jobs (${error.message}). Check your LLM configuration in Settings → Integrations, then resume scoring.`,
          );
        }
        logger.warn("Job scoring failed — leaving unscored and continuing", {
          jobId: job.id,
          title: job.title,
          error: error.message,
        });
        progressHelpers.scoringJob(
          completed,
          unprocessedJobs.length,
          {
            id: job.id,
            title: `${job.title} (failed)`,
            employer: job.employer,
          },
          exceptional,
        );
        return;
      }
      const { score, reason, jobBrief, jobUpdates = {} } = scoringResult;
      if (args.shouldCancel?.()) return;

      let sponsorMatchScore = 0;
      let sponsorMatchNames: string | undefined;

      if (job.employer) {
        const sponsorResults = await visaSponsors.searchSponsors(job.employer, {
          limit: 10,
          minScore: 50,
          countryKey: args.visaSponsorCountryKey ?? undefined,
        });

        const summary =
          visaSponsors.calculateSponsorMatchSummary(sponsorResults);
        sponsorMatchScore = summary.sponsorMatchScore;
        sponsorMatchNames = summary.sponsorMatchNames ?? undefined;
      }

      // Check if job should be auto-skipped based on score threshold
      const shouldAutoSkip =
        job.status !== "applied" &&
        score !== null &&
        autoSkipThreshold !== null &&
        !Number.isNaN(autoSkipThreshold) &&
        score < autoSkipThreshold;

      await jobsRepo.updateJob(job.id, {
        ...jobUpdates,
        suitabilityScore: score,
        suitabilityReason: reason,
        jobBrief,
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

      if (score !== null && score > 90) exceptional += 1;
      completed += 1;
      progressHelpers.scoringJob(
        completed,
        unprocessedJobs.length,
        {
          id: job.id,
          title: job.title,
          employer: job.employer,
        },
        exceptional,
      );
      scoredJobs.push({
        ...job,
        ...jobUpdates,
        suitabilityScore: score,
        suitabilityReason: reason,
      });
    },
  });

  progressHelpers.scoringComplete(scoredJobs.length);
  logger.info("Scoring step completed", {
    scoredJobs: scoredJobs.length,
    failedJobs: failed,
    concurrency: SCORING_CONCURRENCY,
  });

  return { unprocessedJobs, scoredJobs };
}
