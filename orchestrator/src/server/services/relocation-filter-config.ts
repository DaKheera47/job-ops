/**
 * Build the runtime {@link RelocationFilterConfig} from the user's
 * `relocationHomeCities` + `relocationAccessibleRegions` settings.
 *
 * Falls back to the registered defaults in `settings-registry.ts` when the
 * user has not overridden them — those defaults encode "Munich-based EU
 * candidate" today, but they live in settings, not in the filter itself,
 * so a different user changes them via the Settings UI without code edits.
 */

import type { RelocationFilterConfig } from "./relocation-filter";
import { getEffectiveSettings } from "./settings";

function readArraySetting(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function buildRelocationFilterConfigFromSettings(): Promise<RelocationFilterConfig> {
  const settings = await getEffectiveSettings();
  return {
    homeCities: readArraySetting(settings.relocationHomeCities?.value),
    accessibleRegions: readArraySetting(
      settings.relocationAccessibleRegions?.value,
    ),
  };
}
