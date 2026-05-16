/**
 * Relocation filter — decides whether a job's location implies the candidate
 * would need to move.  Used by the pipeline to auto-skip listings that aren't
 * in the user's home metro and aren't genuinely remote.
 *
 * Current user is in Munich and does not relocate.  Keep:
 *   - Munich and its suburbs (hard-coded list below)
 *   - country/region-only locations ("Germany", "Europe", "DE") — these
 *     typically indicate honest remote postings
 *   - any location containing an explicit remote marker ("Remote",
 *     "Anywhere", "Home Office", "Werk van thuis", "Telearbeit")
 *
 * Reject everything else (Berlin, Hamburg, Düsseldorf, Amsterdam, Dubai, …).
 *
 * NOTE: We intentionally do NOT trust the source's `isRemote` flag in
 * isolation — LinkedIn and Indeed routinely set it for hybrid roles that
 * still require relocation.  The location string is the authoritative signal.
 */

const MUNICH_KEYWORDS = [
  "munich",
  "münchen",
  "muenchen",
  "garching",
  "gräfelfing",
  "graefelfing",
  "unterföhring",
  "unterfoehring",
  "kirchheim",
  "germering",
  "aschheim",
  "ottobrunn",
  "planegg",
  "martinsried",
  "neubiberg",
  "haar",
  "ismaning",
  "oberhaching",
  "vaterstetten",
  "putzbrunn",
  "pullach",
  "taufkirchen",
];

const COUNTRY_OR_REGION_ONLY: ReadonlySet<string> = new Set([
  "germany",
  "de",
  "deutschland",
  "netherlands",
  "nl",
  "europe",
  "eu",
  "european union",
  "worldwide",
  "global",
  "united states",
  "us",
  "usa",
  "canada",
  "ca",
  "anywhere",
  "anywhere in the world",
  "remote",
  "europe & united states",
]);

const REMOTE_MARKERS = [
  "remote",
  "anywhere",
  "home office",
  "werk van thuis",
  "telearbeit",
  "fully remote",
  "100% remote",
];

export interface RelocationFilterJob {
  location?: string | null;
  isRemote?: boolean | null;
  workFromHomeType?: string | null;
}

/**
 * Returns true if the job's location indicates a non-Munich on-site role
 * with no remote option.  The pipeline auto-skips these.
 *
 * Rules (most specific first):
 *   1. Empty location → unknown, don't filter.
 *   2. Munich (or one of its suburbs) → keep.
 *   3. Explicit remote marker in the location string ("Remote", "Anywhere",
 *      "Home Office", …) → keep regardless of `isRemote`.
 *   4. Country / region only ("Germany", "United States", "DE") → keep ONLY
 *      if the source flagged the role as remote.  Without that flag, a bare
 *      country location almost always means "on-site at company HQ in that
 *      country" — for the US/UK/CA pool we just added this would otherwise
 *      flood the queue with relocation roles.
 *   5. Any other location string (city-level) → relocation.
 */
export function requiresRelocation(job: RelocationFilterJob): boolean {
  const loc = (job.location ?? "").toLowerCase().trim();
  if (!loc) return false;
  if (MUNICH_KEYWORDS.some((k) => loc.includes(k))) return false;

  if (REMOTE_MARKERS.some((m) => loc.includes(m))) return false;

  const normalized = loc.replace(/\s+/g, " ").trim();
  const isCountryOrRegionOnly =
    COUNTRY_OR_REGION_ONLY.has(normalized) || /^[a-z]{2,3}$/.test(normalized);
  if (isCountryOrRegionOnly) {
    return job.isRemote !== true;
  }

  return true;
}

export const RELOCATION_SKIP_REASON =
  "Auto-skipped: location requires relocation outside Munich";
