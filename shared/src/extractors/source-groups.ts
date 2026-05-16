/**
 * Source-group helpers — pick which extractor source IDs to run based on the
 * user's location scope.
 *
 * The pipeline has three scope modes (LocationSearchScope):
 *   - "selected_only"                         → run only sources tied to the
 *                                                selected country.
 *   - "selected_plus_remote_worldwide"        → selected country sources +
 *                                                global remote-only boards.
 *   - "remote_worldwide_prioritize_selected"  → global remote-only boards +
 *                                                country sources kept as a
 *                                                secondary signal.
 *
 * The two remote-friendly modes auto-include the remote-only boards we wired
 * in via PR1 + PR2 so the user doesn't have to enable them manually.
 */

import type { LocationSearchScope } from "../location-domain";
import type { ExtractorSourceId } from "./index";

/**
 * Sources that are exclusively or predominantly remote.  Adding these to the
 * pipeline at run-time costs almost nothing — they only return jobs when the
 * remote workplace type is allowed.
 */
export const REMOTE_FRIENDLY_SOURCES: ExtractorSourceId[] = [
  "workingnomads",
  "weworkremotely",
  "remotive",
  "remoteok",
  "himalayas",
  "hackernews",
  "justjoinit",
  "nofluffjobs",
  // NOTE: hh.ru aggressively geo-blocks API requests originating outside
  // CIS IP ranges (any User-Agent rewrite is ineffective).  Keep the
  // extractor wired for users on CIS networks, but don't auto-enable it
  // here so EU/US users don't waste polling cycles on guaranteed-forbidden
  // responses.  To re-enable manually: add "hhru" to the pipeline sources
  // setting from the Settings UI.
  // "hhru",
];

/**
 * Default sources for the country-bound scope.  Mirrors the historical
 * `DEFAULT_CONFIG.sources` value in the pipeline orchestrator.
 */
export const COUNTRY_BOUND_DEFAULT_SOURCES: ExtractorSourceId[] = [
  "gradcracker",
  "indeed",
  "linkedin",
  "ukvisajobs",
];

export interface ResolveAutoSourcesOptions {
  /** The user's geo scope from settings.  Falls back to selected_only. */
  scope: LocationSearchScope | string | null | undefined;
  /**
   * Base list to extend.  Pass the historical defaults for the
   * "selected_only" scope or an empty array if you want the helper to drive
   * the whole picture.
   */
  baseSources?: ExtractorSourceId[];
}

function dedupePreservingOrder<T>(values: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

/**
 * Returns the source IDs the pipeline should run for the given scope.
 * - selected_only                       → baseSources unchanged
 * - selected_plus_remote_worldwide      → baseSources + REMOTE_FRIENDLY
 * - remote_worldwide_prioritize_selected → REMOTE_FRIENDLY + baseSources
 */
export function resolveAutoEnabledSources(
  options: ResolveAutoSourcesOptions,
): ExtractorSourceId[] {
  const base = options.baseSources ?? COUNTRY_BOUND_DEFAULT_SOURCES;
  const scope = options.scope ?? "selected_only";

  if (scope === "remote_worldwide_prioritize_selected") {
    return dedupePreservingOrder([...REMOTE_FRIENDLY_SOURCES, ...base]);
  }

  if (scope === "selected_plus_remote_worldwide") {
    return dedupePreservingOrder([...base, ...REMOTE_FRIENDLY_SOURCES]);
  }

  return dedupePreservingOrder(base);
}

/**
 * Returns just the remote-friendly sources that get auto-enabled for the
 * given scope.  Useful for telling the user which extractors will run.
 */
export function autoEnabledRemoteSources(
  scope: LocationSearchScope | string | null | undefined,
): ExtractorSourceId[] {
  if (
    scope === "selected_plus_remote_worldwide" ||
    scope === "remote_worldwide_prioritize_selected"
  ) {
    return [...REMOTE_FRIENDLY_SOURCES];
  }
  return [];
}
