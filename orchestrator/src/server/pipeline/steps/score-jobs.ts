import { logger } from "@infra/logger";
import type { Job } from "@shared/types";
import * as jobsRepo from "../../repositories/jobs";
import { scoreJobSuitability } from "../../services/scorer";
import * as visaSponsors from "../../services/visa-sponsors/index";
import { progressHelpers, updateProgress } from "../progress";
import type { ScoredJob } from "./types";

export async function scoreJobsStep(args: {
  profile: Record<string, unknown>;
}): Promise<{ unprocessedJobs: Job[]; scoredJobs: ScoredJob[] }> {
  logger.info("Running scoring step");
  const unprocessedJobs = await jobsRepo.getUnscoredDiscoveredJobs();

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

    await jobsRepo.updateJob(job.id, {
      suitabilityScore: score,
      suitabilityReason: reason,
      sponsorMatchScore,
      sponsorMatchNames,
    });
  }

  progressHelpers.scoringComplete(scoredJobs.length);
  logger.info("Scoring step completed", { scoredJobs: scoredJobs.length });

  return { unprocessedJobs, scoredJobs };
}
