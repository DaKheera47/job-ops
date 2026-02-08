import type { JobSource } from "./types";

const COUNTRY_ALIASES: Record<string, string> = {
  uk: "united kingdom",
  us: "united states",
  usa: "united states",
  türkiye: "turkey",
  "czech republic": "czechia",
};

const COUNTRY_LABELS: Record<string, string> = {
  "united kingdom": "United Kingdom",
  "united states": "United States",
  "usa/ca": "USA/CA",
  turkey: "Turkey",
  czechia: "Czechia",
};

// Keep this list aligned with the JobSpy supported country inputs.
export const SUPPORTED_COUNTRY_INPUTS = [
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
  "czech republic",
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
  "türkiye",
  "turkey",
  "ukraine",
  "united arab emirates",
  "uk",
  "united kingdom",
  "usa",
  "us",
  "united states",
  "uruguay",
  "venezuela",
  "vietnam",
  "usa/ca",
  "worldwide",
] as const;

const UK_ONLY_SOURCES = new Set<JobSource>(["gradcracker", "ukvisajobs"]);

export function normalizeCountryKey(value: string | null | undefined): string {
  const normalized = value?.trim().toLowerCase() ?? "";
  return COUNTRY_ALIASES[normalized] ?? normalized;
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

export function isSourceAllowedForCountry(
  source: JobSource,
  country: string | null | undefined,
): boolean {
  if (!UK_ONLY_SOURCES.has(source)) return true;
  return isUkCountry(country);
}

export function getCompatibleSourcesForCountry(
  sources: JobSource[],
  country: string | null | undefined,
): JobSource[] {
  return sources.filter((source) => isSourceAllowedForCountry(source, country));
}
