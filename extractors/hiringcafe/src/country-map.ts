import {
  getCountryIso2Code,
  normalizeCountryKey,
} from "@shared/location-support.js";

export interface HiringCafeCountryLocation {
  formatted_address: string;
  types: ["country"];
  id: "user_country";
  address_components: Array<{
    long_name: string;
    short_name: string;
    types: ["country"];
  }>;
  options: {
    flexible_regions: ["anywhere_in_continent", "anywhere_in_world"];
  };
}

const GLOBAL_SEARCH_KEYS = new Set(["worldwide", "usa/ca"]);

const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  "united states": "United States",
  "united kingdom": "United Kingdom",
  "united arab emirates": "United Arab Emirates",
  "new zealand": "New Zealand",
  "south korea": "South Korea",
  "south africa": "South Africa",
  "costa rica": "Costa Rica",
  "saudi arabia": "Saudi Arabia",
  "hong kong": "Hong Kong",
  czechia: "Czechia",
  türkiye: "Turkey",
  turkey: "Turkey",
};

function toCountryLabel(countryKey: string): string {
  const override = COUNTRY_NAME_OVERRIDES[countryKey];
  if (override) return override;
  return countryKey.replace(/\b\w/g, (char) => char.toUpperCase());
}

export function shouldUseGlobalLocation(countryInput?: string | null): boolean {
  const countryKey = normalizeCountryKey(countryInput);
  return !countryKey || GLOBAL_SEARCH_KEYS.has(countryKey);
}

export function resolveHiringCafeCountryLocation(
  countryInput?: string | null,
): HiringCafeCountryLocation | null {
  const countryKey = normalizeCountryKey(countryInput);
  if (!countryKey || GLOBAL_SEARCH_KEYS.has(countryKey)) return null;

  const iso2 = getCountryIso2Code(countryKey);
  if (!iso2) return null;

  const longName = toCountryLabel(countryKey);

  return {
    formatted_address: longName,
    types: ["country"],
    id: "user_country",
    address_components: [
      {
        long_name: longName,
        short_name: iso2,
        types: ["country"],
      },
    ],
    options: {
      flexible_regions: ["anywhere_in_continent", "anywhere_in_world"],
    },
  };
}
