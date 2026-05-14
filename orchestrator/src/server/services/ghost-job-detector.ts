/**
 * Heuristic ghost-job detector — flags listings that look unlikely to result
 * in a real hire so the user does not waste tailoring tokens or time on them.
 *
 * Inspired by career-ops Block G "Posting Legitimacy". Signals are surfaced
 * neutrally — we never accuse the company of fraud, we only summarise public
 * cues so the candidate can de-prioritise low-signal postings.
 */

import { logger } from "@infra/logger";
import type {
  Job,
  JobLegitimacySignal,
  JobLegitimacyTier,
} from "@shared/types";

export interface GhostJobAssessment {
  tier: JobLegitimacyTier;
  score: number; // 0-100, higher = more legitimate
  signals: JobLegitimacySignal[];
}

const REPOST_KEYWORDS = [
  "always hiring",
  "always recruiting",
  "ongoing position",
  "evergreen role",
  "evergreen position",
  "rolling basis",
  "applications accepted on a rolling basis",
];

const VAGUE_KEYWORDS = [
  "rockstar",
  "ninja",
  "wear many hats",
  "fast-paced environment",
  "self-starter",
];

const STRONG_TRUST_KEYWORDS = [
  "hiring manager",
  "interview process",
  "team you would work with",
  "report to",
  "reports to",
  "we use",
  "our stack",
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Date(ts);
}

function tierFromScore(score: number): JobLegitimacyTier {
  if (score >= 70) return "green";
  if (score >= 40) return "yellow";
  return "red";
}

/**
 * Pure-heuristic ghost-job detector. Runs in-process, no LLM call, no network.
 * Designed to be cheap enough to run on every job at scoring time.
 */
export function assessJobLegitimacy(job: Job): GhostJobAssessment {
  const signals: JobLegitimacySignal[] = [];
  let score = 80; // start optimistic

  const description = (job.jobDescription ?? "").toLowerCase();
  const trimmedDescription = description.trim();
  const wordCount = trimmedDescription
    ? trimmedDescription.split(/\s+/).length
    : 0;

  // 1. Description length — extremely short JDs are a red flag.
  if (wordCount === 0) {
    signals.push({
      code: "no_description",
      label: "No job description available",
      weight: "high",
    });
    score -= 25;
  } else if (wordCount < 60) {
    signals.push({
      code: "very_short_description",
      label: `Very short job description (${wordCount} words)`,
      weight: "medium",
    });
    score -= 12;
  }

  // 2. Posting age — older than 45 days is a soft signal of repost / phantom.
  const datePosted = parseDate(job.datePosted);
  if (datePosted) {
    const ageDays = Math.floor(
      (Date.now() - datePosted.getTime()) / MS_PER_DAY,
    );
    if (ageDays >= 90) {
      signals.push({
        code: "stale_posting",
        label: `Posted ${ageDays} days ago — likely repost`,
        weight: "high",
      });
      score -= 18;
    } else if (ageDays >= 45) {
      signals.push({
        code: "aged_posting",
        label: `Posted ${ageDays} days ago`,
        weight: "medium",
      });
      score -= 8;
    } else if (ageDays >= 21) {
      signals.push({
        code: "older_posting",
        label: `Posted ${ageDays} days ago`,
        weight: "low",
      });
      score -= 3;
    }
  }

  // 3. Repost / evergreen wording.
  for (const keyword of REPOST_KEYWORDS) {
    if (description.includes(keyword)) {
      signals.push({
        code: "evergreen_language",
        label: `Evergreen wording: "${keyword}"`,
        weight: "medium",
      });
      score -= 10;
      break;
    }
  }

  // 4. Vague hype keywords without team specifics.
  let vagueHits = 0;
  for (const keyword of VAGUE_KEYWORDS) {
    if (description.includes(keyword)) vagueHits += 1;
  }
  if (vagueHits >= 2) {
    signals.push({
      code: "vague_hype",
      label: `Vague hype language (${vagueHits} hits)`,
      weight: "low",
    });
    score -= 5;
  }

  // 5. Trust signals — well-written JDs that mention process / stack / team
  //    structure are more likely to be real.
  let trustHits = 0;
  for (const keyword of STRONG_TRUST_KEYWORDS) {
    if (description.includes(keyword)) trustHits += 1;
  }
  if (trustHits >= 2) {
    signals.push({
      code: "process_specifics",
      label: "Mentions interview process / stack / team structure",
      weight: "low",
    });
    score += 8;
  }

  // 6. No salary AND remote-anywhere is a soft phantom signal.
  if (!job.salary && job.isRemote === true && !job.location) {
    signals.push({
      code: "fully_remote_no_salary",
      label: "Fully remote, no salary disclosed",
      weight: "low",
    });
    score -= 4;
  }

  // 7. Missing employer URL is a low-trust signal.
  if (!job.employerUrl && !job.companyUrlDirect) {
    signals.push({
      code: "no_company_url",
      label: "No company website link in posting",
      weight: "low",
    });
    score -= 3;
  }

  // 8. Deadline already past = job is dead.
  const deadline = parseDate(job.deadline);
  if (deadline && deadline.getTime() < Date.now()) {
    signals.push({
      code: "deadline_passed",
      label: "Application deadline has already passed",
      weight: "high",
    });
    score -= 25;
  }

  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const tier = tierFromScore(clampedScore);

  logger.debug("Ghost-job assessment", {
    jobId: job.id,
    score: clampedScore,
    tier,
    signalCount: signals.length,
  });

  return { tier, score: clampedScore, signals };
}
