export function normalizeCountryKey(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "uk") return "united kingdom";
  if (normalized === "us" || normalized === "usa") return "united states";
  if (normalized === "türkiye") return "turkey";
  if (normalized === "czech republic") return "czechia";
  return normalized;
}

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

const ISO2_ALIASES: Record<string, string> = {
  "united states": "US",
  "united kingdom": "GB",
  "united arab emirates": "AE",
  "new zealand": "NZ",
  "south korea": "KR",
  "south africa": "ZA",
  "costa rica": "CR",
  "saudi arabia": "SA",
  "hong kong": "HK",
  czechia: "CZ",
  türkiye: "TR",
  turkey: "TR",
};

const regionNameMap = buildRegionNameMap();

function buildRegionNameMap(): Map<string, string> {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const map = new Map<string, string>();

  for (let i = 65; i <= 90; i += 1) {
    for (let j = 65; j <= 90; j += 1) {
      const iso2 = String.fromCharCode(i, j);
      const displayName = names.of(iso2);
      if (!displayName || displayName === iso2) continue;
      map.set(normalizeCountryKey(displayName), iso2);
    }
  }

  return map;
}

function toCountryLabel(countryKey: string): string {
  const override = COUNTRY_NAME_OVERRIDES[countryKey];
  if (override) return override;
  return countryKey.replace(/\b\w/g, (char) => char.toUpperCase());
}

function toIso2(countryKey: string): string | null {
  if (ISO2_ALIASES[countryKey]) {
    return ISO2_ALIASES[countryKey];
  }
  return regionNameMap.get(countryKey) ?? null;
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

  const iso2 = toIso2(countryKey);
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
