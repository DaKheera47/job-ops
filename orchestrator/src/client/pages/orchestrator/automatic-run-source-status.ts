import {
  EXTRACTOR_SOURCE_METADATA,
  type ExtractorSourceId,
} from "@shared/extractors";
import type { LocationSourcePlan } from "@shared/location-intelligence.js";
import { formatCountryLabel } from "@shared/location-support.js";
import { sourceLabel } from "@/lib/utils";

const GLASSDOOR_COUNTRY_REASON =
  "Glassdoor is not available for the selected country.";
const GLASSDOOR_LOCATION_REASON =
  "Add at least one city in Location preferences to enable Glassdoor.";

export interface AutomaticSourceStatus {
  badgeLabel: string;
  detail: string;
  available: boolean;
}

function getKnownJobSource(
  source: LocationSourcePlan["source"],
): ExtractorSourceId | null {
  return source in EXTRACTOR_SOURCE_METADATA
    ? (source as ExtractorSourceId)
    : null;
}

export function getSourceStatus(args: {
  countrySelected: boolean;
  plan: LocationSourcePlan;
}): AutomaticSourceStatus {
  const { countrySelected, plan } = args;
  const { source, requestedCountry, requestedCities } = plan;
  const knownSource = getKnownJobSource(source);
  const countryLabel = requestedCountry
    ? formatCountryLabel(requestedCountry)
    : "";
  const sourceName = knownSource ? sourceLabel[knownSource] : source;
  const isUkOnlySource = knownSource
    ? Boolean(EXTRACTOR_SOURCE_METADATA[knownSource]?.ukOnly)
    : false;

  if (!countrySelected) {
    if (source === "glassdoor" || isUkOnlySource) {
      return {
        badgeLabel: "Select country",
        detail:
          "Pick a country first to check whether this source is available.",
        available: false,
      };
    }

    return {
      badgeLabel: "Available",
      detail: "This source is available without a country selection.",
      available: true,
    };
  }

  if (source === "glassdoor") {
    if (
      plan.capabilities.supportedCountryKeys !== null &&
      requestedCountry !== null &&
      !plan.capabilities.supportedCountryKeys.includes(requestedCountry)
    ) {
      return {
        badgeLabel: "Blocked",
        detail: GLASSDOOR_COUNTRY_REASON,
        available: false,
      };
    }

    if (
      plan.capabilities.requiresCityLocations &&
      requestedCities.length === 0
    ) {
      return {
        badgeLabel: "Needs city",
        detail: GLASSDOOR_LOCATION_REASON,
        available: false,
      };
    }

    return {
      badgeLabel: "Available",
      detail: "Glassdoor is available for this location intent.",
      available: true,
    };
  }

  if (isUkOnlySource && !plan.canRun) {
    return {
      badgeLabel: "UK only",
      detail: `${sourceName} is available only when country is United Kingdom.`,
      available: false,
    };
  }

  if (!plan.canRun) {
    return {
      badgeLabel: "Blocked",
      detail: `${sourceName} is not available for ${countryLabel || "the selected country"}.`,
      available: false,
    };
  }

  return {
    badgeLabel: "Available",
    detail: "Available for this location intent.",
    available: true,
  };
}
