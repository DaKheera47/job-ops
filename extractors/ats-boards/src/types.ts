export interface AtsBoardEntry {
  provider: "greenhouse" | "ashby" | "lever" | "workday" | "smartrecruiters";
  slug: string;
}

const REMOTE_LOCATION_RE =
  /\b(remote|anywhere|distributed|worldwide|global|wfh|fully\s*remote|100%\s*remote|home\s*office|telecommute)\b/i;

/**
 * Heuristic remote detection for ATS-board listings.
 *
 * Greenhouse/Lever/Ashby/SmartRecruiters give us a free-form location string
 * and (for some) the body text — neither has an `isRemote` boolean.  We
 * trust the location field first (companies put "Remote" there when they
 * mean it), then fall back to body text only when location is generic
 * ("Not specified" / empty).  Avoids false positives from descriptions
 * that merely *mention* remote work without offering it.
 */
export function detectIsRemoteFromAts(
  location: string | null | undefined,
  description?: string | null,
): boolean {
  if (typeof location === "string" && REMOTE_LOCATION_RE.test(location)) {
    return true;
  }
  // Only consult description when location is missing/uninformative.
  const loc = (location ?? "").toLowerCase().trim();
  const locUninformative =
    !loc || loc === "not specified" || loc === "various" || loc === "global";
  if (locUninformative && typeof description === "string") {
    return REMOTE_LOCATION_RE.test(description.slice(0, 800));
  }
  return false;
}
