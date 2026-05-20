import { logger } from "@infra/logger";
import * as jobsRepo from "@server/repositories/jobs";
import {
  formatSkipReason,
  screenJob,
} from "@server/services/job-screening";
import { getResumeKeywords } from "@server/services/resume-keywords-loader";

/**
 * Auto-skip discovered jobs that either (a) belong to a clearly mismatched
 * career domain (medical, payroll, field sales, …) or (b) share zero
 * keywords with the candidate's design resume.  Runs after import + after
 * the relocation filter, before the LLM scorer touches the queue — the
 * point is to save tokens AND keep the user-facing "All Jobs" list focused
 * on relevant roles.
 *
 * Idempotent: only acts on rows still in `status='discovered'` with no
 * suitability score yet (the underlying repository update already enforces
 * the status guard).
 *
 * Returns a `degraded` flag (true when the resume keyword load failed or
 * returned empty) so the orchestrator can surface this in the run summary
 * — a silently disabled language/signal gate must NOT look like "no jobs
 * matched the rules".
 */
export async function filterAntiDomainJobsStep(): Promise<{
  markedCount: number;
  byReason: Record<string, number>;
  degraded: boolean;
  degradationReason: string | null;
}> {
  const discovered = await jobsRepo.getUnscoredDiscoveredJobs();
  if (discovered.length === 0)
    return {
      markedCount: 0,
      byReason: {},
      degraded: false,
      degradationReason: null,
    };

  const loaded = await getResumeKeywords();
  const resumeKeywords = loaded.keywords;
  if (loaded.degraded) {
    logger.warn(
      "Anti-domain filter running in degraded mode — language gate and resume-signal gate disabled",
      { reason: loaded.degradationReason, candidates: discovered.length },
    );
  }
  const byReason: Record<string, number> = {};
  const groupsByReasonText = new Map<string, string[]>();

  for (const job of discovered) {
    const result = screenJob(
      { title: job.title, jobDescription: job.jobDescription },
      resumeKeywords,
    );
    if (!result.skip) continue;

    let reasonKey: string;
    if (result.reason.kind === "anti_domain") {
      reasonKey = `anti_domain:${result.reason.domain}`;
    } else if (result.reason.kind === "language_required") {
      reasonKey = `language_required:${result.reason.language}`;
    } else {
      reasonKey = "no_resume_signal";
    }
    byReason[reasonKey] = (byReason[reasonKey] ?? 0) + 1;

    const reasonText = formatSkipReason(result.reason);
    const existing = groupsByReasonText.get(reasonText);
    if (existing) {
      existing.push(job.id);
    } else {
      groupsByReasonText.set(reasonText, [job.id]);
    }
  }

  if (groupsByReasonText.size === 0) {
    logger.info("Anti-domain filter: no discovered jobs matched skip rules", {
      candidates: discovered.length,
      resumeTokens: resumeKeywords.tokens.size,
      degraded: loaded.degraded,
    });
    return {
      markedCount: 0,
      byReason,
      degraded: loaded.degraded,
      degradationReason: loaded.degradationReason,
    };
  }

  let markedCount = 0;
  for (const [reasonText, ids] of groupsByReasonText) {
    markedCount += await jobsRepo.markJobsSkippedWithReason(ids, reasonText);
  }

  logger.info("Anti-domain filter auto-skipped jobs", {
    candidates: discovered.length,
    marked: markedCount,
    byReason,
    resumeTokens: resumeKeywords.tokens.size,
    degraded: loaded.degraded,
  });

  return {
    markedCount,
    byReason,
    degraded: loaded.degraded,
    degradationReason: loaded.degradationReason,
  };
}
