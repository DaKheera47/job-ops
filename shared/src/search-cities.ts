import { normalizeCountryKey } from "./location-support.js";

const LOCATION_ALIASES: Record<string, string> = {
  uk: "united kingdom",
  us: "united states",
  usa: "united states",
};

export function normalizeLocationToken(
  value: string | null | undefined,
): string {
  const normalized = value?.trim().toLowerCase().replace(/\s+/g, " ") ?? "";
  if (!normalized) return "";
  return LOCATION_ALIASES[normalized] ?? normalized;
}

export function parseSearchCitiesSetting(
  value: string | null | undefined,
): string[] {
  const trimmed = value?.trim();
  if (!trimmed) return [];
  const split = trimmed.includes("|")
    ? trimmed.split("|")
    : trimmed.includes("\n")
      ? trimmed.split("\n")
      : [trimmed];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of split) {
    const normalized = raw.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function serializeSearchCitiesSetting(cities: string[]): string | null {
  if (cities.length === 0) return null;
  return cities.join("|");
}

export function shouldApplyStrictCityFilter(
  city: string,
  country: string,
): boolean {
  const normalizedCity = normalizeLocationToken(city);
  const normalizedCountry = normalizeCountryKey(country);
  if (!normalizedCity || !normalizedCountry) return false;
  return normalizedCity !== normalizedCountry;
}

export function matchesRequestedCity(
  jobLocation: string | undefined,
  requestedCity: string,
): boolean {
  const normalizedJobLocation = normalizeLocationToken(jobLocation)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizedRequestedLocation = normalizeLocationToken(requestedCity)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalizedJobLocation || !normalizedRequestedLocation) return false;

  const jobTokens = normalizedJobLocation.split(" ");
  const requestedTokens = normalizedRequestedLocation.split(" ");
  if (requestedTokens.length > jobTokens.length) return false;

  for (let i = 0; i <= jobTokens.length - requestedTokens.length; i += 1) {
    let matches = true;
    for (let j = 0; j < requestedTokens.length; j += 1) {
      if (jobTokens[i + j] !== requestedTokens[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }

  return false;
}
