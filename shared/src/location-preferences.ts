import { formatCountryLabel, normalizeCountryKey } from "./location-support.js";

export const LOCATION_SEARCH_SCOPE_VALUES = [
  "selected_only",
  "selected_plus_remote_worldwide",
  "remote_worldwide_prioritize_selected",
] as const;

export type LocationSearchScope = (typeof LOCATION_SEARCH_SCOPE_VALUES)[number];

export const LOCATION_MATCH_STRICTNESS_VALUES = [
  "exact_only",
  "flexible",
] as const;

export type LocationMatchStrictness =
  (typeof LOCATION_MATCH_STRICTNESS_VALUES)[number];

export function normalizeLocationSearchScope(
  value: string | null | undefined,
): LocationSearchScope {
  return LOCATION_SEARCH_SCOPE_VALUES.includes(value as LocationSearchScope)
    ? (value as LocationSearchScope)
    : "selected_only";
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

function normalizeSummaryWorkplaceTypes(
  workplaceTypes: Array<"remote" | "hybrid" | "onsite"> | null | undefined,
): Array<"remote" | "hybrid" | "onsite"> {
  const seen = new Set<"remote" | "hybrid" | "onsite">();
  const out: Array<"remote" | "hybrid" | "onsite"> = [];
  for (const workplaceType of workplaceTypes ?? []) {
    if (!["remote", "hybrid", "onsite"].includes(workplaceType)) continue;
    if (seen.has(workplaceType)) continue;
    seen.add(workplaceType);
    out.push(workplaceType);
  }
  return out;
}

function joinList(values: string[]): string {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}

function describeSelectedGeography(args: {
  country: string;
  cityLocations: string[];
}): string {
  const countryLabel = formatCountryLabel(args.country) || "your selected area";
  const cities = args.cityLocations
    .map((city) => city.trim())
    .filter(Boolean)
    .filter(
      (city) => normalizeCountryKey(city) !== normalizeCountryKey(args.country),
    );

  if (cities.length === 0) return countryLabel;
  if (cities.length === 1) return `${cities[0]} in ${countryLabel}`;
  if (cities.length === 2)
    return `${cities[0]} and ${cities[1]} in ${countryLabel}`;
  return `${cities.length} selected cities in ${countryLabel}`;
}

function describeNonRemoteWorkplaceTypes(
  workplaceTypes: Array<"remote" | "hybrid" | "onsite">,
): string {
  const nonRemote = workplaceTypes.filter((type) => type !== "remote");
  const labels = nonRemote.map((type) =>
    type === "onsite" ? "onsite" : "hybrid",
  );
  return joinList(labels);
}

export function buildLocationPreferencesSummary(args: {
  country: string;
  cityLocations: string[];
  workplaceTypes: Array<"remote" | "hybrid" | "onsite">;
  searchScope: LocationSearchScope;
  matchStrictness: LocationMatchStrictness;
}): string {
  const workplaceTypes = normalizeSummaryWorkplaceTypes(args.workplaceTypes);
  const remoteSelected = workplaceTypes.includes("remote");
  const nonRemotePhrase = describeNonRemoteWorkplaceTypes(workplaceTypes);
  const selectedGeography = describeSelectedGeography({
    country: args.country,
    cityLocations: args.cityLocations,
  });

  let summary: string;
  switch (args.searchScope) {
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

  if (args.matchStrictness === "flexible") {
    return `${summary} Likely matches are included.`;
  }

  return summary;
}
