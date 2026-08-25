import type { JobSource } from "./types";

const COUNTRY_ALIASES: Record<string, string> = {
  britain: "united kingdom",
  "czech republic": "czechia",
  eg: "egypt",
  england: "united kingdom",
  "great britain": "united kingdom",
  "korea, republic of": "south korea",
  netherland: "netherlands",
  "northern ireland": "united kingdom",
  "republic of korea": "south korea",
  "russian federation": "russia",
  scotland: "united kingdom",
  "the netherlands": "netherlands",
  turkiye: "turkey",
  uk: "united kingdom",
  uae: "united arab emirates",
  "united states of america": "united states",
  us: "united states",
  usa: "united states",
  türkiye: "turkey",
  wales: "united kingdom",
};

const COUNTRY_LABELS: Record<string, string> = {
  "united kingdom": "United Kingdom",
  "united states": "United States",
  "usa/ca": "USA/CA",
  turkey: "Turkey",
  czechia: "Czechia",
};

// This is the app-level country catalog. Individual extractors decide whether a
// selected country is compatible with their own upstream source.
export const SUPPORTED_COUNTRY_INPUTS = [
  "afghanistan",
  "albania",
  "algeria",
  "andorra",
  "angola",
  "argentina",
  "armenia",
  "australia",
  "austria",
  "azerbaijan",
  "bahamas",
  "bahrain",
  "bangladesh",
  "barbados",
  "belarus",
  "belgium",
  "belize",
  "benin",
  "bhutan",
  "bolivia",
  "bosnia and herzegovina",
  "botswana",
  "brazil",
  "brunei",
  "bulgaria",
  "burkina faso",
  "burundi",
  "cambodia",
  "cameroon",
  "canada",
  "cape verde",
  "central african republic",
  "chad",
  "chile",
  "china",
  "colombia",
  "comoros",
  "congo",
  "costa rica",
  "cote d'ivoire",
  "croatia",
  "cuba",
  "cyprus",
  "czech republic",
  "czechia",
  "denmark",
  "djibouti",
  "dominican republic",
  "ecuador",
  "eg",
  "egypt",
  "el salvador",
  "equatorial guinea",
  "eritrea",
  "estonia",
  "ethiopia",
  "fiji",
  "finland",
  "france",
  "gabon",
  "gambia",
  "georgia",
  "germany",
  "ghana",
  "greece",
  "guatemala",
  "guinea",
  "guyana",
  "haiti",
  "honduras",
  "hong kong",
  "hungary",
  "iceland",
  "india",
  "indonesia",
  "ireland",
  "israel",
  "italy",
  "jamaica",
  "japan",
  "jordan",
  "kazakhstan",
  "kenya",
  "kuwait",
  "kyrgyzstan",
  "laos",
  "latvia",
  "lebanon",
  "lesotho",
  "liberia",
  "libya",
  "liechtenstein",
  "lithuania",
  "luxembourg",
  "madagascar",
  "malawi",
  "malaysia",
  "maldives",
  "mali",
  "malta",
  "mauritania",
  "mauritius",
  "mexico",
  "moldova",
  "monaco",
  "mongolia",
  "montenegro",
  "morocco",
  "mozambique",
  "myanmar",
  "namibia",
  "nepal",
  "netherlands",
  "new zealand",
  "nicaragua",
  "niger",
  "nigeria",
  "north macedonia",
  "norway",
  "oman",
  "pakistan",
  "palestine",
  "panama",
  "paraguay",
  "peru",
  "philippines",
  "poland",
  "portugal",
  "qatar",
  "romania",
  "russia",
  "russian federation",
  "rwanda",
  "saudi arabia",
  "senegal",
  "serbia",
  "seychelles",
  "sierra leone",
  "singapore",
  "slovakia",
  "slovenia",
  "somalia",
  "south africa",
  "south korea",
  "sri lanka",
  "sudan",
  "suriname",
  "tanzania",
  "spain",
  "sweden",
  "switzerland",
  "taiwan",
  "tajikistan",
  "thailand",
  "trinidad and tobago",
  "tunisia",
  "türkiye",
  "turkey",
  "uganda",
  "ukraine",
  "united arab emirates",
  "uk",
  "united kingdom",
  "usa",
  "us",
  "united states",
  "uruguay",
  "uzbekistan",
  "venezuela",
  "vietnam",
  "zambia",
  "zimbabwe",
  "usa/ca",
  "worldwide",
] as const;

const ADZUNA_COUNTRY_CODE_BY_KEY: Record<string, string> = {
  "united kingdom": "gb",
  "united states": "us",
  austria: "at",
  australia: "au",
  belgium: "be",
  brazil: "br",
  canada: "ca",
  switzerland: "ch",
  germany: "de",
  spain: "es",
  france: "fr",
  india: "in",
  italy: "it",
  mexico: "mx",
  netherlands: "nl",
  "new zealand": "nz",
  poland: "pl",
  singapore: "sg",
  "south africa": "za",
};

export const JOBSPY_SUPPORTED_COUNTRY_KEYS = [
  "argentina",
  "australia",
  "austria",
  "bahrain",
  "bangladesh",
  "belgium",
  "bulgaria",
  "brazil",
  "canada",
  "chile",
  "china",
  "colombia",
  "costa rica",
  "croatia",
  "cyprus",
  "czechia",
  "denmark",
  "ecuador",
  "egypt",
  "estonia",
  "finland",
  "france",
  "germany",
  "greece",
  "hong kong",
  "hungary",
  "india",
  "indonesia",
  "ireland",
  "israel",
  "italy",
  "japan",
  "kuwait",
  "latvia",
  "lithuania",
  "luxembourg",
  "malaysia",
  "malta",
  "mexico",
  "morocco",
  "netherlands",
  "new zealand",
  "nigeria",
  "norway",
  "oman",
  "pakistan",
  "panama",
  "peru",
  "philippines",
  "poland",
  "portugal",
  "qatar",
  "romania",
  "saudi arabia",
  "singapore",
  "slovakia",
  "slovenia",
  "south africa",
  "south korea",
  "spain",
  "sweden",
  "switzerland",
  "taiwan",
  "thailand",
  "turkey",
  "ukraine",
  "united arab emirates",
  "united kingdom",
  "united states",
  "uruguay",
  "venezuela",
  "vietnam",
  "usa/ca",
  "worldwide",
] as const;

export const GLASSDOOR_SUPPORTED_COUNTRY_KEYS = [
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
] as const;

export const ADZUNA_SUPPORTED_COUNTRY_KEYS = Object.keys(
  ADZUNA_COUNTRY_CODE_BY_KEY,
);

const SOURCE_SUPPORTED_COUNTRY_KEYS: Partial<Record<JobSource, string[]>> = {
  gradcracker: ["united kingdom"],
  indeed: [...JOBSPY_SUPPORTED_COUNTRY_KEYS],
  linkedin: [...JOBSPY_SUPPORTED_COUNTRY_KEYS],
  glassdoor: [...GLASSDOOR_SUPPORTED_COUNTRY_KEYS],
  ukvisajobs: ["united kingdom"],
  adzuna: [...ADZUNA_SUPPORTED_COUNTRY_KEYS],
  jobindex: ["denmark"],
  seek: ["australia", "new zealand"],
  naukri: ["india"],
  fiveamsat: ["egypt"],
  wazzuf: ["egypt"],
};

const SOURCE_SUPPORTED_COUNTRY_KEYS_NORMALIZED: Partial<
  Record<JobSource, string[]>
> = {};
const SOURCE_SUPPORTED_COUNTRY_SETS: Partial<Record<JobSource, Set<string>>> =
  {};

for (const [source, countries] of Object.entries(
  SOURCE_SUPPORTED_COUNTRY_KEYS,
) as Array<[JobSource, string[]]>) {
  const normalized = countries.map((country) => normalizeCountryKey(country));
  SOURCE_SUPPORTED_COUNTRY_KEYS_NORMALIZED[source] = normalized;
  SOURCE_SUPPORTED_COUNTRY_SETS[source] = new Set(normalized);
}

export function getSourceSupportedCountryKeys(
  source: JobSource,
): string[] | null {
  return SOURCE_SUPPORTED_COUNTRY_KEYS_NORMALIZED[source] ?? null;
}

export function sourceRequiresCityLocations(source: JobSource): boolean {
  return source === "glassdoor";
}

export function normalizeCountryKey(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  return COUNTRY_ALIASES[normalized] ?? normalized;
}

const ISO2_ALIASES: Record<string, string> = {
  czechia: "CZ",
  "hong kong": "HK",
  "south korea": "KR",
  turkey: "TR",
  "united arab emirates": "AE",
  "united kingdom": "GB",
  "united states": "US",
};

const COUNTRY_NAME_LOCALES = ["en", "de", "es", "fr", "it", "nl", "pt", "tr"];
const regionNameMap = buildRegionNameMap();
const validRegionCodes = new Set(regionNameMap.values());
const localizedRegionNames = COUNTRY_NAME_LOCALES.map(
  (locale) => new Intl.DisplayNames([locale], { type: "region" }),
);
const countryNameVariantCache = new Map<string, string[]>();

function buildRegionNameMap(): Map<string, string> {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  const map = new Map<string, string>();

  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const iso2 = String.fromCharCode(first, second);
      const displayName = names.of(iso2);
      if (!displayName || displayName === iso2) continue;
      map.set(normalizeCountryKey(displayName), iso2);
    }
  }

  return map;
}

export function getCountryIso2Code(
  country: string | null | undefined,
): string | null {
  const countryKey = normalizeCountryKey(country);
  const code = countryKey.toUpperCase();
  if (/^[A-Z]{2}$/.test(code) && validRegionCodes.has(code)) return code;
  return ISO2_ALIASES[countryKey] ?? regionNameMap.get(countryKey) ?? null;
}

export function getCountryNameVariants(
  country: string | null | undefined,
): string[] {
  const countryKey = normalizeCountryKey(country);
  if (!countryKey) return [];

  const cached = countryNameVariantCache.get(countryKey);
  if (cached) return cached;

  const iso2 = getCountryIso2Code(countryKey);
  const variants = new Set([
    countryKey,
    ...Object.entries(COUNTRY_ALIASES)
      .filter(([, canonical]) => canonical === countryKey)
      .map(([alias]) => alias),
  ]);

  if (iso2) {
    for (const names of localizedRegionNames) {
      const displayName = names.of(iso2);
      if (displayName && displayName !== iso2) variants.add(displayName);
    }
  }

  const result = [...variants];
  countryNameVariantCache.set(countryKey, result);
  return result;
}

export function formatCountryLabel(value: string): string {
  const normalized = normalizeCountryKey(value);
  if (!normalized) return "";
  return (
    COUNTRY_LABELS[normalized] ||
    normalized.replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export const SUPPORTED_COUNTRY_KEYS = Array.from(
  new Set(
    SUPPORTED_COUNTRY_INPUTS.map((country) => normalizeCountryKey(country)),
  ),
).filter(Boolean);

export function isUkCountry(country: string | null | undefined): boolean {
  return normalizeCountryKey(country) === "united kingdom";
}

export function isGlassdoorCountry(
  country: string | null | undefined,
): boolean {
  return (
    SOURCE_SUPPORTED_COUNTRY_SETS.glassdoor?.has(
      normalizeCountryKey(country),
    ) ?? false
  );
}

export function getAdzunaCountryCode(
  country: string | null | undefined,
): string | null {
  return ADZUNA_COUNTRY_CODE_BY_KEY[normalizeCountryKey(country)] ?? null;
}

export function isSourceAllowedForCountry(
  source: JobSource,
  country: string | null | undefined,
): boolean {
  const supportedCountryKeys = SOURCE_SUPPORTED_COUNTRY_SETS[source];
  return (
    supportedCountryKeys === undefined ||
    supportedCountryKeys.has(normalizeCountryKey(country))
  );
}

export function getCompatibleSourcesForCountry(
  sources: JobSource[],
  country: string | null | undefined,
): JobSource[] {
  return sources.filter((source) => isSourceAllowedForCountry(source, country));
}
