/**
 * Relocation filter — decides whether a job's location implies the candidate
 * would need to move (or be ineligible because of residency / visa).  Used
 * by the pipeline to auto-skip listings that aren't in the user's home
 * metro and aren't remote-accessible from the candidate's country.
 *
 * Multi-tenant by design (see CLAUDE.md → "Mandatory: Multi-User First
 * Design"): this module holds **zero** user-specific constants.  All
 * candidate-specific knobs (home cities, regions the candidate can work
 * remote from) come from `RelocationFilterConfig`, built at runtime from
 * the `relocationHomeCities` + `relocationAccessibleRegions` settings.
 *
 * The static knowledge in this file is purely a "world atlas" — country
 * names and umbrella region markers.  It does not encode which user the
 * service is serving today.  Tomorrow a Tokyo-based candidate's
 * `accessibleRegions` setting flips allow / disallow without code change.
 */

import {
  SUPPORTED_COUNTRY_KEYS,
  normalizeCountryKey,
} from "@shared/location-support.js";

/**
 * Static world atlas — non-user-specific facts about geography.  Used only
 * to decide WHETHER a location string contains a known region tag.  Whether
 * that region is acceptable for the candidate is decided by their
 * configured `accessibleRegions`.
 *
 * Sources:
 *   - SUPPORTED_COUNTRY_KEYS gives ~200 normalised country names.
 *   - NON_COUNTRY_REGIONS adds umbrella tags ("EMEA", "APAC", …) that are
 *     not in the country list but appear in job location strings.
 *   - SHORT_REGION_CODES need word-boundary matching to avoid false
 *     positives ("us" inside "houston", "uk" inside "ukraine").
 */
const NON_COUNTRY_REGIONS = [
  "europe",
  "european union",
  "european",
  "eu",
  "emea",
  "worldwide",
  "anywhere",
  "global",
  "distributed",
  "north america",
  "americas",
  "amer",
  "latam",
  "latin america",
  "asia pacific",
  "asia-pacific",
  "apac",
  "middle east",
  // Sub-national region tags that frequently appear in postings instead
  // of a country name.  Treated as atlas tokens (geographic facts), not
  // user-specific data.
  "ontario",
  "quebec",
  "alberta",
  "british columbia",
  "manitoba",
  "saskatchewan",
  "nova scotia",
  "newfoundland",
] as const;

const SHORT_REGION_CODES = ["us", "usa", "uk", "de", "nl", "eu", "apac", "amer"] as const;

const REMOTE_MARKERS = [
  "remote",
  "anywhere",
  "worldwide",
  "global",
  "distributed",
  "home office",
  "werk van thuis",
  "telearbeit",
  "fully remote",
  "100% remote",
] as const;

/** Atlas of all known long-form region names (countries + umbrella regions). */
const ATLAS_LONG_REGIONS: ReadonlySet<string> = new Set<string>([
  ...SUPPORTED_COUNTRY_KEYS,
  ...NON_COUNTRY_REGIONS,
]);

export interface RelocationFilterJob {
  location?: string | null;
  isRemote?: boolean | null;
  workFromHomeType?: string | null;
}

export interface RelocationFilterConfig {
  /**
   * Locations containing any of these case-insensitive substrings are
   * kept regardless of remote / hybrid flags (the candidate's home
   * city + suburbs).  Empty list = no city is auto-allowed.
   */
  homeCities: readonly string[];
  /**
   * Regions / countries acceptable for remote work from the candidate's
   * home.  Long-form names (≥4 chars) are matched as case-insensitive
   * substrings; short codes (≤3 chars like "us" / "de" / "eu") are
   * matched at word boundaries to avoid false positives.
   *
   * A location string containing a remote marker AND a known region tag
   * NOT in this list is treated as region-locked relocation.
   */
  accessibleRegions: readonly string[];
}

// ---------- Matching primitives ----------

function containsAny(text: string, list: readonly string[]): boolean {
  return list.some((kw) => text.includes(kw));
}

function containsWordBoundary(text: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text);
}

function isShortCode(token: string): boolean {
  return token.length <= 3;
}

function matchesAccessible(
  loc: string,
  accessible: readonly string[],
): boolean {
  for (const token of accessible) {
    const t = token.toLowerCase();
    if (!t) continue;
    if (isShortCode(t)) {
      if (containsWordBoundary(loc, t)) return true;
    } else if (loc.includes(t)) {
      return true;
    }
  }
  return false;
}

/**
 * Returns true if `loc` mentions a known region (atlas) that the candidate
 * does NOT have in their accessible list — i.e. the location is region-tagged
 * to somewhere the candidate cannot work from.
 */
function matchesAtlasNonAccessible(
  loc: string,
  accessible: readonly string[],
): boolean {
  const accessibleSet = new Set(
    accessible
      .map((t) => t.toLowerCase().trim())
      .filter(Boolean)
      .map((t) => normalizeCountryKey(t)),
  );

  // Long-form atlas tokens (substring match).
  for (const region of ATLAS_LONG_REGIONS) {
    if (region.length < 4) continue;
    if (accessibleSet.has(normalizeCountryKey(region))) continue;
    if (loc.includes(region)) return true;
  }

  // Short codes (word-boundary match).
  for (const code of SHORT_REGION_CODES) {
    if (accessibleSet.has(normalizeCountryKey(code))) continue;
    if (containsWordBoundary(loc, code)) return true;
  }

  return false;
}

// ---------- Public predicate ----------

/**
 * Returns true if the job's location indicates a role that would force the
 * candidate to move (or be ineligible because of residency / visa).  The
 * pipeline auto-skips these.
 *
 * Rules (most specific first):
 *   1. Empty location → unknown, don't filter.
 *   2. Home city match → keep, regardless of remote/hybrid.
 *   3. Remote marker + accessible region in same string → keep
 *      ("Remote, Germany").
 *   4. Remote marker + atlas-known but non-accessible region → relocation
 *      ("Remote — US", "Remote, Japan", "Remote, Toronto").
 *   5. Remote marker + no region tag → keep ("Remote", "Anywhere").
 *   6. `workFromHomeType === "hybrid"` outside home → relocation
 *      (hybrid roles require physical presence on most days).
 *   7. Country / region-only locations:
 *      - non-accessible region (e.g. "United States") → relocation
 *        regardless of `isRemote` (US-residents-only remote);
 *      - accessible region requires `isRemote=true` ("Germany" + remote
 *        flag means honest remote posting).
 *   8. Any other location (city-level outside home) → relocation.
 */
export function requiresRelocation(
  job: RelocationFilterJob,
  config: RelocationFilterConfig,
): boolean {
  const loc = (job.location ?? "").toLowerCase().trim();
  if (!loc) return false;
  if (containsAny(loc, config.homeCities)) return false;

  const hasRemoteMarker = REMOTE_MARKERS.some((m) => loc.includes(m));
  if (hasRemoteMarker) {
    if (matchesAccessible(loc, config.accessibleRegions)) return false;
    if (matchesAtlasNonAccessible(loc, config.accessibleRegions)) return true;
    return false;
  }

  const wfh = (job.workFromHomeType ?? "").toLowerCase().trim();
  if (wfh === "hybrid") return true;

  const normalized = loc.replace(/\s+/g, " ").trim();
  const isCountryOrRegionOnly =
    matchesAccessible(normalized, config.accessibleRegions) ||
    matchesAtlasNonAccessible(normalized, config.accessibleRegions) ||
    /^[a-z]{2,3}$/.test(normalized);

  if (isCountryOrRegionOnly) {
    if (matchesAtlasNonAccessible(normalized, config.accessibleRegions)) {
      return true;
    }
    return job.isRemote !== true;
  }

  return true;
}

export const RELOCATION_SKIP_REASON =
  "Auto-skipped: location requires relocation outside home region";
