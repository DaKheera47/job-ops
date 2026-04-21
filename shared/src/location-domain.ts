import {
  formatCountryLabel,
  isSourceAllowedForCountry,
  normalizeCountryKey,
} from "./location-support.js";
import { normalizeStringArray } from "./normalize-string-array.js";
import {
  matchesRequestedCity,
  matchesRequestedCountry,
  parseSearchCitiesSetting,
  shouldApplyStrictCityFilter,
} from "./search-cities.js";
import type { JobSource } from "./types/jobs.js";
import { normalizeWhitespace } from "./utils/string.js";

export const LOCATION_GEO_SCOPE_VALUES = [
  "selected_only",
  "selected_plus_remote_worldwide",
  "remote_worldwide_prioritize_selected",
] as const;

export type LocationGeoScope = (typeof LOCATION_GEO_SCOPE_VALUES)[number];

export const LOCATION_SEARCH_SCOPE_VALUES = LOCATION_GEO_SCOPE_VALUES;

export type LocationSearchScope = LocationGeoScope;

export const LOCATION_MATCH_STRICTNESS_VALUES = [
  "exact_only",
  "flexible",
] as const;

export type LocationMatchStrictness =
  (typeof LOCATION_MATCH_STRICTNESS_VALUES)[number];

export const LOCATION_WORKPLACE_TYPE_VALUES = [
  "remote",
  "hybrid",
  "onsite",
] as const;

export type LocationWorkplaceType =
  (typeof LOCATION_WORKPLACE_TYPE_VALUES)[number];

export type LocationEvidenceEntryKind =
  | "location"
  | "city"
  | "region"
  | "country";

export interface LocationEvidenceEntry {
  kind: LocationEvidenceEntryKind;
  value: string;
  sourceField?: string | null;
}

export type LocationEvidenceQuality =
  | "exact"
  | "approximate"
  | "weak"
  | "unknown";

const BROAD_COUNTRY_SENTINELS = new Set([
  "",
  "all",
  "anywhere",
  "global",
  "remote",
]);

export interface LocationIntentInput {
  selectedCountry?: string | null;
  country?: string | null;
  cityLocations?: readonly string[] | null;
  searchCities?: string | readonly string[] | null;
  workplaceTypes?: readonly (LocationWorkplaceType | string)[] | null;
  geoScope?: string | null;
  searchScope?: string | null;
  matchStrictness?: string | null;
}

export interface LocationIntent {
  selectedCountry: string | null;
  country: string | null;
  cityLocations: string[];
  workplaceTypes: LocationWorkplaceType[];
  geoScope: LocationGeoScope;
  searchScope: LocationSearchScope;
  matchStrictness: LocationMatchStrictness;
}

export interface LocationEvidenceInput {
  rawLocation?: string | null;
  location?: string | null;
  countryKey?: string | null;
  country?: string | null;
  city?: string | null;
  regionHints?: readonly string[] | null;
  workplaceType?: LocationWorkplaceType | string | null;
  isRemote?: boolean | null;
  isHybrid?: boolean | null;
  evidenceQuality?: LocationEvidenceQuality | null;
  sourceNotes?: readonly string[] | null;
  source?: string | null;
}

export interface LocationEvidence {
  rawLocation?: string | null;
  location?: string | null;
  countryKey?: string | null;
  country?: string | null;
  city?: string | null;
  regionHints?: readonly string[] | null;
  workplaceType?: LocationWorkplaceType | null;
  isRemote?: boolean | null;
  isHybrid?: boolean | null;
  evidenceQuality?: LocationEvidenceQuality;
  sourceNotes?: readonly string[] | null;
  source?: string | null;
  [index: number]: unknown;
}

export interface LocationSourceCapabilitiesInput {
  source: JobSource | string;
  supportedCountryKeys?: readonly string[] | null;
  requiresCityLocations?: boolean | null;
}

export interface LocationSourceCapabilities {
  source: JobSource | string;
  supportedCountryKeys: string[] | null;
  requiresCityLocations: boolean;
}

export interface LocationSourcePlan {
  source: JobSource | string;
  capabilities: LocationSourceCapabilities;
  intent: LocationIntent;
  requestedCountry: string | null;
  requestedCities: string[];
  allowRemoteWorldwide: boolean;
  prioritizeSelectedLocation: boolean;
  isCompatible: boolean;
  canRun: boolean;
  reasons: string[];
  warnings: string[];
}

export interface LocationPlanResult {
  intent: LocationIntent;
  plans: LocationSourcePlan[];
  compatibleSources: Array<JobSource | string>;
  incompatibleSources: Array<JobSource | string>;
}

export interface LocationMatchResult {
  matched: boolean;
  matchedBy:
    | "selected_location"
    | "remote_worldwide"
    | "unfiltered"
    | "no_match";
  reasonCode:
    | "selected_location"
    | "remote_worldwide"
    | "unfiltered"
    | "no_match";
  priority: 0 | 1;
  intent: LocationIntent;
  evidence: LocationEvidence;
  countryMatched: boolean;
  cityMatched: boolean;
  remoteMatched: boolean;
  reasons: string[];
}

function normalizeStringOrNull(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeWhitespace(value ?? "");
  return normalized ? normalized : null;
}

function normalizeWorkplaceType(
  value: LocationWorkplaceType | string | null | undefined,
): LocationWorkplaceType | null {
  if (value === "remote" || value === "hybrid" || value === "onsite") {
    return value;
  }
  return null;
}

function normalizeWorkplaceTypes(
  values: readonly (LocationWorkplaceType | string)[] | null | undefined,
): LocationWorkplaceType[] {
  const seen = new Set<LocationWorkplaceType>();
  const out: LocationWorkplaceType[] = [];

  for (const value of values ?? []) {
    const normalized = normalizeWorkplaceType(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function normalizeCountryKeys(
  values: readonly string[] | null | undefined,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values ?? []) {
    const normalized = normalizeCountryKey(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out;
}

function normalizeSelectedCountryKey(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeCountryKey(value);
  return normalized && !BROAD_COUNTRY_SENTINELS.has(normalized)
    ? normalized
    : null;
}

function normalizeLocationEvidenceEntries(
  value: readonly LocationEvidenceEntry[],
): LocationEvidence {
  let location: string | null = null;
  let country: string | null = null;
  let city: string | null = null;
  let isRemote = false;
  let workplaceType: LocationWorkplaceType | null = null;

  for (const entry of value) {
    const normalizedValue = normalizeStringOrNull(entry.value);
    if (!normalizedValue) continue;

    if (!location) {
      location = normalizedValue;
    }

    switch (entry.kind) {
      case "location":
        if (
          /remote|worldwide|anywhere|work from home|wfh/i.test(normalizedValue)
        ) {
          isRemote = true;
          workplaceType = workplaceType ?? "remote";
        }
        if (/hybrid/i.test(normalizedValue)) {
          workplaceType = "hybrid";
        }
        location = normalizedValue;
        break;
      case "country":
        country = normalizeSelectedCountryKey(normalizedValue);
        break;
      case "city":
        city = normalizedValue;
        break;
    }
  }

  return {
    location,
    country,
    city,
    workplaceType,
    isRemote: isRemote || null,
    source: null,
  };
}

function inferWorkplaceTypeFromEvidence(
  value: LocationEvidenceInput | LocationEvidence,
): LocationWorkplaceType | null {
  const workplaceType = normalizeWorkplaceType(value.workplaceType);
  if (workplaceType) return workplaceType;
  if (value.isRemote === true) return "remote";

  const rawLocation = normalizeStringOrNull(
    value.location ?? ("rawLocation" in value ? value.rawLocation : null),
  );
  if (rawLocation) {
    if (/hybrid/i.test(rawLocation)) return "hybrid";
    if (/remote|worldwide|anywhere|work from home|wfh/i.test(rawLocation)) {
      return "remote";
    }
  }

  return null;
}

function createDefaultSupportedCountryKeys(
  source: JobSource | string,
): string[] | null {
  switch (source) {
    case "gradcracker":
    case "ukvisajobs":
      return ["united kingdom"];
    case "seek":
      return ["australia", "new zealand"];
    case "glassdoor":
      return [
        "australia",
        "austria",
        "belgium",
        "brazil",
        "canada",
        "france",
        "germany",
        "hong kong",
        "india",
        "ireland",
        "italy",
        "mexico",
        "netherlands",
        "new zealand",
        "singapore",
        "spain",
        "switzerland",
        "united kingdom",
        "united states",
        "vietnam",
      ];
    case "adzuna":
      return [
        "united kingdom",
        "united states",
        "austria",
        "australia",
        "belgium",
        "brazil",
        "canada",
        "switzerland",
        "germany",
        "spain",
        "france",
        "india",
        "italy",
        "mexico",
        "netherlands",
        "new zealand",
        "poland",
        "singapore",
        "south africa",
      ];
    default:
      return null;
  }
}

function buildEvidenceLocationText(
  evidence: Pick<LocationEvidence, "location" | "city" | "country">,
): string | undefined {
  if (evidence.location) return evidence.location;

  const parts = [evidence.city, evidence.country].filter(
    (value): value is string => Boolean(value),
  );
  if (parts.length === 0) return undefined;
  return parts.join(", ");
}

function describeSelectedGeography(
  selectedCountry: string | null,
  cityLocations: string[],
): string {
  const cities = normalizeStringArray(cityLocations);
  const countryLabel = selectedCountry
    ? formatCountryLabel(selectedCountry) || "your selected area"
    : "your selected area";

  if (!selectedCountry) {
    if (cities.length === 0) return countryLabel;
    if (cities.length === 1) return cities[0] ?? countryLabel;
    if (cities.length === 2) {
      return `${cities[0]} and ${cities[1]}`;
    }
    return `${cities.length} selected cities`;
  }

  const filteredCities = cities.filter(
    (city) =>
      normalizeCountryKey(city) !== normalizeCountryKey(selectedCountry),
  );

  if (filteredCities.length === 0) return countryLabel;
  if (filteredCities.length === 1) {
    return `${filteredCities[0]} in ${countryLabel}`;
  }
  if (filteredCities.length === 2) {
    return `${filteredCities[0]} and ${filteredCities[1]} in ${countryLabel}`;
  }

  return `${filteredCities.length} selected cities in ${countryLabel}`;
}

function joinList(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function describeNonRemoteWorkplaceTypes(
  workplaceTypes: LocationWorkplaceType[],
): string {
  const nonRemote = workplaceTypes.filter((type) => type !== "remote");
  const labels = nonRemote.map((type) =>
    type === "onsite" ? "onsite" : "hybrid",
  );
  return joinList(labels);
}

function normalizeGeoScope(value: string | null | undefined): LocationGeoScope {
  return LOCATION_GEO_SCOPE_VALUES.includes(value as LocationGeoScope)
    ? (value as LocationGeoScope)
    : "selected_only";
}

function normalizeSearchCitiesInput(
  value: string | readonly string[] | null | undefined,
): string[] {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }
  return parseSearchCitiesSetting(
    typeof value === "string" ? value : undefined,
  );
}

export function normalizeLocationGeoScope(
  value: string | null | undefined,
): LocationGeoScope {
  return normalizeGeoScope(value);
}

export function normalizeLocationSearchScope(
  value: string | null | undefined,
): LocationSearchScope {
  return normalizeGeoScope(value);
}

export function normalizeLocationMatchStrictness(
  value: string | null | undefined,
): LocationMatchStrictness {
  return LOCATION_MATCH_STRICTNESS_VALUES.includes(
    value as LocationMatchStrictness,
  )
    ? (value as LocationMatchStrictness)
    : "exact_only";
}

export function normalizeLocationWorkplaceType(
  value: LocationWorkplaceType | string | null | undefined,
): LocationWorkplaceType | null {
  return normalizeWorkplaceType(value);
}

export function normalizeLocationWorkplaceTypes(
  values: readonly (LocationWorkplaceType | string)[] | null | undefined,
): LocationWorkplaceType[] {
  return normalizeWorkplaceTypes(values);
}

export function normalizeLocationCountryKey(
  value: string | null | undefined,
): string {
  return normalizeCountryKey(value);
}

export function normalizeLocationIntent(
  value: LocationIntentInput | LocationIntent,
): LocationIntent {
  const rawSelectedCountry =
    "selectedCountry" in value
      ? value.selectedCountry
      : "country" in value
        ? value.country
        : null;
  const rawGeoScope =
    "geoScope" in value
      ? value.geoScope
      : "searchScope" in value
        ? value.searchScope
        : null;
  const rawCities =
    "cityLocations" in value && value.cityLocations != null
      ? value.cityLocations
      : "searchCities" in value
        ? value.searchCities
        : [];
  const cityLocations = normalizeSearchCitiesInput(rawCities);
  const geoScope = normalizeGeoScope(rawGeoScope);

  const selectedCountry = normalizeSelectedCountryKey(rawSelectedCountry);

  return {
    selectedCountry,
    country: selectedCountry,
    cityLocations,
    workplaceTypes: normalizeWorkplaceTypes(value.workplaceTypes ?? []),
    geoScope,
    searchScope: geoScope,
    matchStrictness: normalizeLocationMatchStrictness(value.matchStrictness),
  };
}

export function createLocationIntent(
  value: LocationIntentInput | LocationIntent,
): LocationIntent {
  return normalizeLocationIntent(value);
}

export function normalizeLocationEvidence(
  value:
    | LocationEvidenceInput
    | LocationEvidence
    | readonly LocationEvidenceEntry[],
): LocationEvidence {
  if (Array.isArray(value)) {
    return normalizeLocationEvidenceEntries(value);
  }

  const evidence = value as LocationEvidenceInput | LocationEvidence;
  const location = normalizeStringOrNull(
    "rawLocation" in evidence
      ? (evidence.rawLocation ?? evidence.location)
      : evidence.location,
  );
  const country = normalizeSelectedCountryKey(
    "countryKey" in evidence
      ? (evidence.countryKey ?? evidence.country)
      : evidence.country,
  );
  const city = normalizeStringOrNull(evidence.city);
  const workplaceType = inferWorkplaceTypeFromEvidence(evidence);
  const isRemote =
    evidence.isRemote ?? (workplaceType === "remote" ? true : null);
  const source = normalizeStringOrNull(evidence.source);

  return {
    rawLocation: location,
    location,
    countryKey: country,
    country,
    city,
    regionHints:
      "regionHints" in evidence ? (evidence.regionHints ?? null) : null,
    workplaceType,
    isRemote,
    isHybrid: "isHybrid" in evidence ? (evidence.isHybrid ?? null) : null,
    evidenceQuality:
      "evidenceQuality" in evidence
        ? (evidence.evidenceQuality ?? "unknown")
        : "unknown",
    sourceNotes:
      "sourceNotes" in evidence ? (evidence.sourceNotes ?? null) : null,
    source,
  };
}

export function getDefaultLocationSourceCapabilities(
  source: JobSource | string,
): LocationSourceCapabilities {
  return {
    source,
    supportedCountryKeys: createDefaultSupportedCountryKeys(source),
    requiresCityLocations: source === "glassdoor",
  };
}

export function normalizeLocationSourceCapabilities(
  value: LocationSourceCapabilitiesInput | LocationSourceCapabilities,
): LocationSourceCapabilities {
  const defaults = getDefaultLocationSourceCapabilities(value.source);
  return {
    source: value.source,
    supportedCountryKeys:
      "supportedCountryKeys" in value
        ? value.supportedCountryKeys === null
          ? null
          : normalizeCountryKeys(value.supportedCountryKeys)
        : defaults.supportedCountryKeys,
    requiresCityLocations:
      "requiresCityLocations" in value
        ? (value.requiresCityLocations ?? defaults.requiresCityLocations)
        : defaults.requiresCityLocations,
  };
}

export function isLocationSourceCompatible(
  intent: LocationIntentInput | LocationIntent,
  source: JobSource | string,
  capabilities?: LocationSourceCapabilitiesInput | LocationSourceCapabilities,
): boolean {
  return planLocationSource({ intent, source, capabilities }).isCompatible;
}

export function planLocationSource(args: {
  intent: LocationIntentInput | LocationIntent;
  source: JobSource | string;
  capabilities?: LocationSourceCapabilitiesInput | LocationSourceCapabilities;
}): LocationSourcePlan {
  const intent = normalizeLocationIntent(args.intent);
  const capabilities = normalizeLocationSourceCapabilities(
    args.capabilities ?? { source: args.source },
  );
  const requestedCountry = intent.selectedCountry;
  const requestedCities = intent.cityLocations;
  const allowRemoteWorldwide =
    intent.workplaceTypes.includes("remote") &&
    intent.geoScope !== "selected_only";
  const prioritizeSelectedLocation =
    intent.geoScope === "remote_worldwide_prioritize_selected";

  let isCompatible = true;
  const reasons: string[] = [];

  if (requestedCountry) {
    const supportedCountryKeys = capabilities.supportedCountryKeys;
    isCompatible =
      supportedCountryKeys === null ||
      supportedCountryKeys.includes(requestedCountry);
    reasons.push(
      isCompatible
        ? `Selected country ${formatCountryLabel(requestedCountry)} is supported.`
        : `Selected country ${formatCountryLabel(requestedCountry)} is not supported.`,
    );
  } else {
    if (capabilities.supportedCountryKeys !== null) {
      isCompatible = false;
      reasons.push("A selected country is required for this source.");
    } else {
      reasons.push("No selected country was provided.");
    }
  }

  if (allowRemoteWorldwide) {
    reasons.push("Remote jobs worldwide are allowed for this intent.");
  }

  if (prioritizeSelectedLocation) {
    reasons.push("Selected geography is prioritized for ties.");
  }

  if (capabilities.requiresCityLocations) {
    if (requestedCities.length === 0) {
      isCompatible = false;
      reasons.push("At least one city is required for this source.");
    } else {
      reasons.push("Requested cities satisfy this source requirement.");
    }
  }

  return {
    source: args.source,
    capabilities,
    intent,
    requestedCountry,
    requestedCities,
    allowRemoteWorldwide,
    prioritizeSelectedLocation,
    isCompatible,
    canRun: isCompatible,
    reasons,
    warnings: isCompatible ? [] : reasons,
  };
}

export function planLocationSources(args: {
  intent: LocationIntentInput | LocationIntent;
  sources: readonly (JobSource | string)[];
  capabilitiesBySource?: Partial<
    Record<
      JobSource | string,
      LocationSourceCapabilitiesInput | LocationSourceCapabilities
    >
  >;
}): LocationPlanResult {
  const intent = normalizeLocationIntent(args.intent);
  const plans = args.sources.map((source) =>
    planLocationSource({
      intent,
      source,
      capabilities: args.capabilitiesBySource?.[source],
    }),
  );

  return {
    intent,
    plans,
    compatibleSources: plans
      .filter((plan) => plan.isCompatible)
      .map((plan) => plan.source),
    incompatibleSources: plans
      .filter((plan) => !plan.isCompatible)
      .map((plan) => plan.source),
  };
}

export function getCompatibleSourcesForLocationIntent(
  sources: readonly (JobSource | string)[],
  intent: LocationIntentInput | LocationIntent,
): Array<JobSource | string> {
  return planLocationSources({ intent, sources }).compatibleSources;
}

export function matchLocationIntent(
  intent: LocationIntentInput | LocationIntent,
  evidence:
    | LocationEvidenceInput
    | LocationEvidence
    | readonly LocationEvidenceEntry[],
): LocationMatchResult {
  const normalizedIntent = normalizeLocationIntent(intent);
  const normalizedEvidence = normalizeLocationEvidence(evidence);
  const evidenceLocation = buildEvidenceLocationText(normalizedEvidence);
  const selectedCountry = normalizedIntent.selectedCountry;
  const requestedCities = normalizedIntent.cityLocations;
  const allowRemoteWorldwide =
    normalizedIntent.workplaceTypes.includes("remote") &&
    normalizedIntent.geoScope !== "selected_only";

  if (!selectedCountry) {
    return {
      matched: true,
      matchedBy: "unfiltered",
      reasonCode: "unfiltered",
      priority: 0,
      intent: normalizedIntent,
      evidence: normalizedEvidence,
      countryMatched: true,
      cityMatched: true,
      remoteMatched: false,
      reasons: ["No selected country was provided."],
    };
  }

  const countryMatched =
    normalizedEvidence.country !== null
      ? normalizeCountryKey(normalizedEvidence.country) === selectedCountry
      : matchesRequestedCountry(evidenceLocation, selectedCountry);

  if (countryMatched) {
    if (requestedCities.length === 0) {
      return {
        matched: true,
        matchedBy: "selected_location",
        reasonCode: "selected_location",
        priority: 1,
        intent: normalizedIntent,
        evidence: normalizedEvidence,
        countryMatched: true,
        cityMatched: true,
        remoteMatched: false,
        reasons: [
          `Selected country ${formatCountryLabel(selectedCountry)} matched.`,
        ],
      };
    }

    const cityMatched = requestedCities.some((requestedCity) => {
      const strict = shouldApplyStrictCityFilter(
        requestedCity,
        selectedCountry,
      );
      if (!strict) return true;
      return (
        matchesRequestedCity(evidenceLocation, requestedCity) ||
        matchesRequestedCity(
          normalizedEvidence.city ?? undefined,
          requestedCity,
        )
      );
    });

    if (cityMatched || normalizedIntent.matchStrictness === "flexible") {
      return {
        matched: true,
        matchedBy: "selected_location",
        reasonCode: "selected_location",
        priority: 1,
        intent: normalizedIntent,
        evidence: normalizedEvidence,
        countryMatched: true,
        cityMatched,
        remoteMatched: false,
        reasons: cityMatched
          ? [
              `Selected country ${formatCountryLabel(selectedCountry)} matched.`,
              "Requested city matched.",
            ]
          : [
              `Selected country ${formatCountryLabel(selectedCountry)} matched.`,
              "City did not match exactly, but flexible matching was allowed.",
            ],
      };
    }
  }

  if (allowRemoteWorldwide && normalizedEvidence.isRemote) {
    return {
      matched: true,
      matchedBy: "remote_worldwide",
      reasonCode: "remote_worldwide",
      priority: 0,
      intent: normalizedIntent,
      evidence: normalizedEvidence,
      countryMatched,
      cityMatched: false,
      remoteMatched: true,
      reasons: ["Remote jobs worldwide are allowed for this intent."],
    };
  }

  const reasons: string[] = [];
  reasons.push(
    countryMatched
      ? `Selected country ${formatCountryLabel(selectedCountry)} matched.`
      : `Selected country ${formatCountryLabel(selectedCountry)} did not match.`,
  );

  if (requestedCities.length > 0 && countryMatched) {
    reasons.push("Requested city did not match.");
  }

  if (allowRemoteWorldwide && !normalizedEvidence.isRemote) {
    reasons.push(
      "Remote jobs worldwide were allowed, but the job was not remote.",
    );
  } else if (!allowRemoteWorldwide) {
    reasons.push("Remote jobs worldwide are not allowed for this intent.");
  }

  return {
    matched: false,
    matchedBy: "no_match",
    reasonCode: "no_match",
    priority: 0,
    intent: normalizedIntent,
    evidence: normalizedEvidence,
    countryMatched,
    cityMatched: false,
    remoteMatched: false,
    reasons,
  };
}

export function describeLocationIntent(
  intent: LocationIntentInput | LocationIntent,
): string {
  const normalized = normalizeLocationIntent(intent);
  const selectedGeography = describeSelectedGeography(
    normalized.selectedCountry,
    normalized.cityLocations,
  );
  const workplaceTypes = normalized.workplaceTypes;
  const remoteSelected = workplaceTypes.includes("remote");
  const nonRemotePhrase = describeNonRemoteWorkplaceTypes(workplaceTypes);

  let summary: string;
  switch (normalized.geoScope) {
    case "selected_plus_remote_worldwide":
      if (remoteSelected) {
        if (nonRemotePhrase) {
          summary = `You'll get ${nonRemotePhrase} jobs in ${selectedGeography} plus remote jobs worldwide.`;
        } else {
          summary = `You'll get remote jobs worldwide, including roles explicitly available in ${selectedGeography}.`;
        }
      } else {
        summary = `You'll only get jobs in ${selectedGeography}.`;
      }
      break;
    case "remote_worldwide_prioritize_selected":
      if (remoteSelected) {
        summary = `You'll get remote jobs worldwide, with ${selectedGeography} favored for local roles.`;
      } else if (nonRemotePhrase) {
        summary = `You'll get ${nonRemotePhrase} jobs in ${selectedGeography} first.`;
      } else {
        summary = `You'll get jobs in ${selectedGeography} first.`;
      }
      break;
    default:
      if (nonRemotePhrase && !remoteSelected) {
        summary = `You'll only get ${nonRemotePhrase} jobs explicitly available in ${selectedGeography}.`;
      } else if (remoteSelected && workplaceTypes.length === 1) {
        summary = `You'll only get remote jobs explicitly available in ${selectedGeography}.`;
      } else {
        summary = `You'll only get jobs explicitly available in ${selectedGeography}.`;
      }
      break;
  }

  if (normalized.matchStrictness === "flexible") {
    return `${summary} Likely matches are included.`;
  }

  return summary;
}

export function summarizeLocationIntent(
  intent: LocationIntentInput | LocationIntent,
): string {
  return describeLocationIntent(intent);
}

export function buildLocationPreferencesSummary(args: {
  country: string;
  cityLocations: string[];
  workplaceTypes: Array<"remote" | "hybrid" | "onsite">;
  searchScope: LocationSearchScope;
  matchStrictness: LocationMatchStrictness;
}): string {
  return describeLocationIntent({
    selectedCountry: args.country,
    cityLocations: args.cityLocations,
    workplaceTypes: args.workplaceTypes,
    geoScope: args.searchScope,
    matchStrictness: args.matchStrictness,
  });
}

export function isSourceCompatibleWithLocationIntent(
  source: JobSource,
  intent: LocationIntentInput | LocationIntent,
): boolean {
  return isSourceAllowedForCountry(
    source,
    normalizeLocationIntent(intent).selectedCountry,
  );
}

export function createLocationIntentFromLegacyInputs(
  value: Partial<LocationIntentInput> & {
    searchCities?: string | readonly string[] | null;
  },
): LocationIntent {
  return normalizeLocationIntent({
    selectedCountry: value.selectedCountry ?? value.country ?? null,
    cityLocations:
      value.cityLocations ?? normalizeSearchCitiesInput(value.searchCities),
    workplaceTypes: value.workplaceTypes ?? [],
    geoScope: value.geoScope ?? value.searchScope ?? null,
    matchStrictness: value.matchStrictness ?? null,
  });
}

export function buildLocationEvidence(
  value:
    | LocationEvidenceInput
    | LocationEvidence
    | readonly LocationEvidenceEntry[],
): LocationEvidence {
  return normalizeLocationEvidence(value);
}

export function getLegacyLocationSelection(
  intent: LocationIntentInput | LocationIntent,
): string {
  return normalizeLocationIntent(intent).selectedCountry ?? "";
}

export function getPrimaryLocationLabel(
  intent: LocationIntentInput | LocationIntent,
): string {
  const normalized = normalizeLocationIntent(intent);
  return describeSelectedGeography(
    normalized.selectedCountry,
    normalized.cityLocations,
  );
}

export function getSourceLocationPlan(
  source: JobSource | string,
  intent: LocationIntentInput | LocationIntent,
  capabilities?: LocationSourceCapabilitiesInput | LocationSourceCapabilities,
): LocationSourcePlan {
  return planLocationSource({ source, intent, capabilities });
}
