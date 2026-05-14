/**
 * Smart Apply eligibility — given a job, decide whether its apply page can
 * be opened in a headed Firefox session and pre-filled.
 *
 * Today we only support Greenhouse and Ashby.  We additionally require the
 * apply URL to look like a public form URL (not a tracking redirect, not an
 * internal staging URL) and we refuse if the page bundles a hard captcha.
 *
 * This module is *cheap*: it only inspects the job fields we already have in
 * the DB.  It must NOT do a network fetch — that happens in the parser when
 * a session actually starts.
 */

import type { EligibilityVerdict, JobApplicabilityContext } from "./types";

const GREENHOUSE_URL_RE = /^https?:\/\/(boards\.greenhouse\.io|job-boards\.greenhouse\.io)\//i;
const ASHBY_URL_RE = /^https?:\/\/jobs\.ashbyhq\.com\//i;

function pickApplyUrl(
  ctx: JobApplicabilityContext,
): string | null {
  const candidates = [ctx.job.applicationLink, ctx.job.jobUrl];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return null;
}

export function evaluateSmartApplyEligibility(
  ctx: JobApplicabilityContext,
): EligibilityVerdict {
  const url = pickApplyUrl(ctx);
  if (!url) {
    return { eligible: false, reason: "Job has no apply URL." };
  }

  if (ctx.job.source === "greenhouse" || GREENHOUSE_URL_RE.test(url)) {
    return { eligible: true, ats: "greenhouse", applyUrl: url };
  }

  if (ctx.job.source === "ashby" || ASHBY_URL_RE.test(url)) {
    return { eligible: true, ats: "ashby", applyUrl: url };
  }

  return {
    eligible: false,
    reason: `Source "${ctx.job.source}" is not yet supported by Smart Apply.`,
  };
}

/**
 * Lightweight helper for UI code (e.g. Telegram handlers) that only need to
 * know whether to render the "🚀 Smart Apply" button.
 */
export function isSmartApplyEligible(ctx: JobApplicabilityContext): boolean {
  return evaluateSmartApplyEligibility(ctx).eligible;
}
