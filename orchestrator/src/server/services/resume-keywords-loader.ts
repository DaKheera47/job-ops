/**
 * Live loader that pulls the candidate's resume JSON from
 * `design_resume_documents` and turns it into a keyword set via the pure
 * extractor in job-screening.ts.  Kept separate so the screening logic
 * stays free of repository imports and DB-schema transitive deps.
 *
 * The cache mirrors candidate-profile.ts (60 s TTL).  Call
 * `clearResumeKeywordsCache()` after the user edits their design resume.
 */

import { getLatestDesignResumeDocument } from "../repositories/design-resume";
import {
  EMPTY_RESUME_KEYWORDS,
  extractKeywordsFromResumeJson,
  type ResumeKeywords,
} from "./job-screening";

let cached: { value: ResumeKeywords; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function clearResumeKeywordsCache(): void {
  cached = null;
}

export async function getResumeKeywords(): Promise<ResumeKeywords> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  let doc: Awaited<ReturnType<typeof getLatestDesignResumeDocument>>;
  try {
    doc = await getLatestDesignResumeDocument();
  } catch {
    cached = { value: EMPTY_RESUME_KEYWORDS, expiresAt: Date.now() + CACHE_TTL_MS };
    return EMPTY_RESUME_KEYWORDS;
  }

  const keywords = doc
    ? extractKeywordsFromResumeJson(doc.resumeJson)
    : EMPTY_RESUME_KEYWORDS;

  cached = { value: keywords, expiresAt: Date.now() + CACHE_TTL_MS };
  return keywords;
}
