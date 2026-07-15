import {
  getCountryIso2Code,
  getCountryNameVariants,
  normalizeCountryKey,
} from "./location-support.js";

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

interface ResolveSearchCitiesOptions {
  list?: string[] | null;
  single?: string | null;
  env?: string | null;
  fallback?: string | null;
}

export function resolveSearchCities(
  options: ResolveSearchCitiesOptions,
): string[] {
  // Priority order:
  // 1) explicit list (searchCities array in config)
  // 2) explicit single value
  // 3) environment fallback
  // 4) final hardcoded/default fallback
  if (options.list && options.list.length > 0) {
    const parsedList = parseSearchCitiesSetting(options.list.join("|"));
    if (parsedList.length > 0) return parsedList;
  }

  const fallbackCandidates = [options.single, options.env, options.fallback];
  for (const candidate of fallbackCandidates) {
    if (candidate === null || candidate === undefined) continue;
    const parsed = parseSearchCitiesSetting(candidate);
    if (parsed.length > 0) return parsed;
  }

  return [];
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
  return matchesRequestedLocationTokens(jobLocation, requestedCity);
}

function matchesRequestedLocationTokens(
  jobLocation: string | undefined,
  requestedLocation: string,
): boolean {
  const normalizedJobLocation = normalizeLocationToken(jobLocation)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  const normalizedRequestedLocation = normalizeLocationToken(requestedLocation)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
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

function matchesRequestedCountryCode(
  jobLocation: string | undefined,
  countryCode: string,
): boolean {
  const parts = (jobLocation ?? "")
    .split(",")
    .map((part) => normalizeLocationToken(part))
    .filter(Boolean);
  const normalizedCode = countryCode.toLowerCase();

  // A two-part location is ambiguous: city/country and city/subdivision use
  // the same shape (Berlin, DE vs Wilmington, DE).
  return parts.length !== 2 && parts.at(-1) === normalizedCode;
}

export function matchesRequestedCountry(
  jobLocation: string | undefined,
  requestedCountry: string,
): boolean {
  const normalizedCountry = normalizeCountryKey(requestedCountry);
  if (!normalizedCountry) return false;

  const iso2 = getCountryIso2Code(normalizedCountry);
  if (iso2 && matchesRequestedCountryCode(jobLocation, iso2)) return true;

  return getCountryNameVariants(normalizedCountry).some((candidate) =>
    matchesRequestedLocationTokens(jobLocation, candidate),
  );
}
