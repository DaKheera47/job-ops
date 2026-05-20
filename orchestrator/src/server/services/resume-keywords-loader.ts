/**
 * Live loader that pulls the candidate's resume JSON from
 * `design_resume_documents` and turns it into a keyword set via the pure
 * extractor in job-screening.ts.  Kept separate so the screening logic
 * stays free of repository imports and DB-schema transitive deps.
 *
 * The cache mirrors candidate-profile.ts (60 s TTL).  Call
 * `clearResumeKeywordsCache()` after the user edits their design resume.
 *
 * IMPORTANT: failures are NOT swallowed.  If the design-resume table is
 * missing/corrupt we still return `EMPTY_RESUME_KEYWORDS` (so the pipeline
 * keeps running with anti-domain only), but we log loudly AND surface a
 * `degraded` flag so the orchestrator can record it in `pipeline_runs`
 * for the Telegram summary — otherwise a silent screening degradation is
 * indistinguishable from "user has no languages in resume".
 */

import { logger } from "@infra/logger";
import { getLatestDesignResumeDocument } from "../repositories/design-resume";
import {
  EMPTY_RESUME_KEYWORDS,
  extractKeywordsFromResumeJson,
  type ResumeKeywords,
} from "./job-screening";

export interface LoadedResumeKeywords {
  readonly keywords: ResumeKeywords;
  /**
   * True when the live load failed (DB error, missing document, parse
   * failure) AND we fell back to EMPTY_RESUME_KEYWORDS. The screening
   * step uses this to log a prominent warning and flag the run as
   * `screeningDegraded` in pipeline_runs.resultSummary.
   */
  readonly degraded: boolean;
  /** Short reason for the degradation, e.g. "no_design_resume". */
  readonly degradationReason: string | null;
}

let cached: { value: LoadedResumeKeywords; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function clearResumeKeywordsCache(): void {
  cached = null;
}

export async function getResumeKeywords(): Promise<LoadedResumeKeywords> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let doc: Awaited<ReturnType<typeof getLatestDesignResumeDocument>>;
  try {
    doc = await getLatestDesignResumeDocument();
  } catch (error) {
    // Loud — this disables the language gate AND the resume-signal gate,
    // leaving only the anti-domain title regex. The pipeline keeps running
    // but the user is effectively unprotected from off-target listings.
    logger.warn(
      "Resume keywords load failed — screening will run with anti-domain only",
      { error: error instanceof Error ? error.message : String(error) },
    );
    const value: LoadedResumeKeywords = {
      keywords: EMPTY_RESUME_KEYWORDS,
      degraded: true,
      degradationReason: "resume_load_error",
    };
    cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  if (!doc) {
    logger.warn(
      "No design resume found — screening will run with anti-domain only (language gate and resume-signal gate disabled)",
    );
    const value: LoadedResumeKeywords = {
      keywords: EMPTY_RESUME_KEYWORDS,
      degraded: true,
      degradationReason: "no_design_resume",
    };
    cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  const keywords = extractKeywordsFromResumeJson(doc.resumeJson);
  const value: LoadedResumeKeywords = {
    keywords,
    degraded: keywords.tokens.size === 0,
    degradationReason: keywords.tokens.size === 0 ? "empty_resume" : null,
  };
  if (value.degraded) {
    logger.warn(
      "Design resume parsed to zero keywords — resume-signal gate will fall open",
      { sourceLength: keywords.sourceLength },
    );
  }
  cached = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}
