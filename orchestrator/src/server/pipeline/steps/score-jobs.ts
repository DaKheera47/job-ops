import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import * as settingsRepo from "@server/repositories/settings";
import { assessJobLegitimacy } from "@server/services/ghost-job-detector";
import {
  LlmNotConfiguredError,
  LlmTransientError,
} from "@server/services/llm-errors";
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

/**
 * Per-run transient-failure threshold.  Below this fraction we silently
 * absorb the per-job failures and let the user re-run later; above it we
 * pause the pipeline so the user can decide whether to wait for the LLM
 * to recover or kill the run.
 *
 * 0.30 keeps the run going through a handful of 5xx/429 hiccups without
 * letting a wholesale LLM outage rack up token spend on retries.
 */
const TRANSIENT_FAILURE_PAUSE_FRACTION = 0.3;
/** Minimum jobs attempted before the fraction is meaningful. */
const TRANSIENT_FAILURE_MIN_ATTEMPTS = 5;

export async function scoreJobsStep(args: {
  profile: Record<string, unknown>;
  shouldCancel?: () => boolean;
}): Promise<{
  unprocessedJobs: Job[];
  scoredJobs: ScoredJob[];
  autoSkipped: number;
  ghostFlagged: number;
  deferredCount: number;
  /** Per-job LLM failures absorbed without pausing the pipeline. */
  transientFailures: number;
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

  // Resolve the auto-skip threshold.  Prefer `autoSkipScoreThreshold` (the
  // canonical setting that's snapshotted into pipeline_runs.effectiveConfig)
  // and fall back to the legacy `pipelineAutoSkipBelow` for users whose
  // config predates the rename.  This is the single place auto-skip lives —
  // the previous duplicate block in orchestrator.ts has been removed so
  // setting BOTH values no longer applies the threshold twice.
  const autoSkipPrimaryRaw = await settingsRepo.getSetting(
    "autoSkipScoreThreshold",
  );
  const autoSkipLegacyRaw = autoSkipPrimaryRaw
    ? null
    : await settingsRepo.getSetting("pipelineAutoSkipBelow");
  const autoSkipRaw = autoSkipPrimaryRaw ?? autoSkipLegacyRaw;
  const autoSkipThreshold = autoSkipRaw ? parseInt(autoSkipRaw, 10) : null;
  if (autoSkipLegacyRaw && !autoSkipPrimaryRaw) {
    logger.warn(
      "Using legacy `pipelineAutoSkipBelow` setting — migrate to `autoSkipScoreThreshold`",
      { legacyValue: autoSkipLegacyRaw },
    );
  }

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
  let transientFailures = 0;
  let attemptedLlmCalls = 0;
  let pipelinePauseError: LlmNotConfiguredError | null = null;

  await asyncPool({
    items: unprocessedJobs,
    concurrency: SCORING_CONCURRENCY,
    shouldStop: () => args.shouldCancel?.() || pipelinePauseError !== null,
    task: async (job) => {
      if (args.shouldCancel?.() || pipelinePauseError) return;

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

      attemptedLlmCalls += 1;

      type ScoreResult = Awaited<ReturnType<typeof scoreJobSuitability>>;
      let scoreResult: ScoreResult;
      try {
        scoreResult = await scoreJobSuitability(job, args.profile);
      } catch (error) {
        if (error instanceof LlmNotConfiguredError) {
          // Hard config error — propagate immediately so the orchestrator
          // can pause and surface a clear message to the user.
          pipelinePauseError = error;
          throw error;
        }
        if (error instanceof LlmTransientError) {
          transientFailures += 1;
          completed += 1;
          progressHelpers.scoringJob(
            completed,
            unprocessedJobs.length,
            `${job.title} (skipped — AI unavailable)`,
          );
          // Leave the job in `discovered` with NO score. The cached-score
          // short-circuit at the top of the task body guarantees we won't
          // re-run successfully-scored jobs, so we only need to persist a
          // human-readable reason for the "All Jobs" UI.
          await jobsRepo.updateJob(job.id, {
            suitabilityReason: `Scoring skipped — AI temporarily unavailable (will retry next run). Cause: ${error.cause ?? error.message}`,
          });
          logger.warn("Skipping one job due to transient LLM failure", {
            jobId: job.id,
            cause: error.cause,
            transientFailures,
            attemptedLlmCalls,
          });

          // Threshold check — if the failure rate is high, the LLM is
          // probably actually down/rate-limited, not "one bad job".  Escalate
          // to a pipeline pause so we don't burn the daily token budget on
          // retries that will all fail anyway.
          if (
            attemptedLlmCalls >= TRANSIENT_FAILURE_MIN_ATTEMPTS &&
            transientFailures / attemptedLlmCalls >=
              TRANSIENT_FAILURE_PAUSE_FRACTION
          ) {
            const pct = Math.round(
              (transientFailures / attemptedLlmCalls) * 100,
            );
            const pauseError = new LlmNotConfiguredError(
              `AI scoring failed for ${pct}% of attempted jobs (${transientFailures}/${attemptedLlmCalls}). The AI provider may be down or rate-limited. Wait and resume, or cancel the run.`,
            );
            pipelinePauseError = pauseError;
            throw pauseError;
          }
          return;
        }
        // Unknown error class — re-throw, the orchestrator will surface
        // it as a hard failure.
        throw error;
      }
      if (args.shouldCancel?.() || pipelinePauseError) return;

      const { score, reason, matchAnalysis } = scoreResult;

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

  // asyncPool catches and re-throws once shouldStop fires — but for the
  // pause-escalation path we want a clear, explicit failure to the caller.
  if (pipelinePauseError) throw pipelinePauseError;

  progressHelpers.scoringComplete(scoredJobs.length);
  logger.info("Scoring step completed", {
    scoredJobs: scoredJobs.length,
    autoSkipped,
    ghostFlagged,
    deferredCount,
    transientFailures,
    attemptedLlmCalls,
    concurrency: SCORING_CONCURRENCY,
  });

  return {
    unprocessedJobs,
    scoredJobs,
    autoSkipped,
    ghostFlagged,
    deferredCount,
    transientFailures,
  };
}
