import {
  normalizeCountryKey,
  SUPPORTED_COUNTRY_KEYS,
} from "@shared/location-support.js";

const STORAGE_KEY = "jobops.user-country-cache.v1";
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface CachedUserCountry {
  country: string;
  detectedAt: number;
}

const REGION_TO_COUNTRY_KEY: Record<string, string> = {
  ar: "argentina",
  at: "austria",
  au: "australia",
  be: "belgium",
  br: "brazil",
  ca: "canada",
  ch: "switzerland",
  cl: "chile",
  co: "colombia",
  cz: "czechia",
  de: "germany",
  dk: "denmark",
  eg: "egypt",
  es: "spain",
  fi: "finland",
  fr: "france",
  gb: "united kingdom",
  gr: "greece",
  hk: "hong kong",
  hu: "hungary",
  ie: "ireland",
  in: "india",
  it: "italy",
  jp: "japan",
  mx: "mexico",
  my: "malaysia",
  nl: "netherlands",
  no: "norway",
  nz: "new zealand",
  pl: "poland",
  pt: "portugal",
  ro: "romania",
  se: "sweden",
  sg: "singapore",
  tr: "turkey",
  ua: "ukraine",
  us: "united states",
  vn: "vietnam",
  za: "south africa",
  uk: "united kingdom",
};

const TIMEZONE_TO_REGION: Array<[prefix: string, region: string]> = [
  ["Europe/London", "gb"],
  ["Europe/Dublin", "ie"],
  ["Europe/Paris", "fr"],
  ["Europe/Berlin", "de"],
  ["Europe/Madrid", "es"],
  ["Europe/Rome", "it"],
  ["Europe/Amsterdam", "nl"],
  ["Europe/Warsaw", "pl"],
  ["Europe/Stockholm", "se"],
  ["Europe/Zurich", "ch"],
  ["Europe/Vienna", "at"],
  ["America/New_York", "us"],
  ["America/Detroit", "us"],
  ["America/Chicago", "us"],
  ["America/Denver", "us"],
  ["America/Los_Angeles", "us"],
  ["America/Phoenix", "us"],
  ["America/Anchorage", "us"],
  ["Pacific/Honolulu", "us"],
  ["America/Toronto", "ca"],
  ["America/Vancouver", "ca"],
  ["America/Montreal", "ca"],
  ["America/Edmonton", "ca"],
  ["America/Winnipeg", "ca"],
  ["Australia/", "au"],
  ["Pacific/Auckland", "nz"],
  ["Asia/Tokyo", "jp"],
  ["Asia/Singapore", "sg"],
  ["Asia/Hong_Kong", "hk"],
  ["Asia/Kolkata", "in"],
  ["Europe/Istanbul", "tr"],
];

function canUseStorage(): boolean {
  return (
    typeof localStorage !== "undefined" &&
    typeof localStorage.getItem === "function" &&
    typeof localStorage.setItem === "function"
  );
}

function normalizeSupportedCountry(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeCountryKey(value);
  if (!normalized) return null;
  return SUPPORTED_COUNTRY_KEYS.includes(normalized) ? normalized : null;
}

function countryFromRegionCode(
  regionCode: string | null | undefined,
): string | null {
  if (!regionCode) return null;
  return normalizeSupportedCountry(
    REGION_TO_COUNTRY_KEY[regionCode.toLowerCase()],
  );
}

function extractRegionCodeFromLocaleTag(localeTag: string): string | null {
  const parts = localeTag.replace(/_/g, "-").split("-");
  for (let index = parts.length - 1; index >= 1; index -= 1) {
    const part = parts[index];
    if (/^[a-z]{2}$/i.test(part)) return part;
  }
  return null;
}

function countryFromTimezone(
  timeZone: string | null | undefined,
): string | null {
  if (!timeZone) return null;
  const matched = TIMEZONE_TO_REGION.find(([prefix]) =>
    timeZone.startsWith(prefix),
  );
  if (!matched) return null;
  return countryFromRegionCode(matched[1]);
}

export function detectUserCountryKey(input?: {
  languages?: readonly string[] | null;
  language?: string | null;
  timeZone?: string | null;
}): string | null {
  const localeCandidates = [
    ...(input?.languages ?? []),
    input?.language ?? null,
  ].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  for (const locale of localeCandidates) {
    const regionCode = extractRegionCodeFromLocaleTag(locale);
    const country = countryFromRegionCode(regionCode);
    if (country) return country;
  }

  return countryFromTimezone(input?.timeZone);
}

function readCachedUserCountry(now: number): string | null {
  if (!canUseStorage()) return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CachedUserCountry>;
    if (
      typeof parsed.country !== "string" ||
      typeof parsed.detectedAt !== "number"
    ) {
      return null;
    }
    if (now - parsed.detectedAt > CACHE_TTL_MS) return null;
    return normalizeSupportedCountry(parsed.country);
  } catch {
    return null;
  }
}

function writeCachedUserCountry(country: string, now: number): void {
  if (!canUseStorage()) return;
  try {
    const payload: CachedUserCountry = { country, detectedAt: now };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures
  }
}

export function getDetectedCountryKey(): string | null {
  const now = Date.now();
  const cached = readCachedUserCountry(now);
  if (cached) return cached;

  const detected = detectUserCountryKey({
    languages:
      typeof navigator !== "undefined" && Array.isArray(navigator.languages)
        ? navigator.languages
        : null,
    language:
      typeof navigator !== "undefined" && typeof navigator.language === "string"
        ? navigator.language
        : null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  if (detected) writeCachedUserCountry(detected, now);
  return detected;
}
