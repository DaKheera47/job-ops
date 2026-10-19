import { getCountryIso2Code } from "@shared/location-support.js";
import type { CreateJobInput } from "@shared/types/jobs";

const ISO2_CODE = /^[a-z]{2}$/i;
const REGION_NAMES = new Intl.DisplayNames(["en"], { type: "region" });

function foldForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function countryNameFromCode(code: string): string | undefined {
  if (!ISO2_CODE.test(code)) return undefined;
  const upper = code.toUpperCase();
  try {
    const name = REGION_NAMES.of(upper);
    return name && name !== upper ? name : undefined;
  } catch {
    return undefined;
  }
}

// FreeHire sometimes tags a US state abbreviation as a country (e.g. "MO" for
// Missouri next to "US"). With several candidates, keep only the one the
// display location names last; otherwise leave the country unknown.
function pickCountry(
  countries: string[],
  location: string | undefined,
): string | undefined {
  if (countries.length === 1) return countryNameFromCode(countries[0]);
  const tail = location?.split(",").at(-1)?.trim();
  if (!tail) return undefined;
  const tailCode = ISO2_CODE.test(tail)
    ? tail.toUpperCase()
    : getCountryIso2Code(tail);
  const match = countries.find((code) => code.toUpperCase() === tailCode);
  return match ? countryNameFromCode(match) : undefined;
}

// Only trust a city the display location actually names, and prefer the one
// it names first ("London, Islington" -> London).
function pickCity(
  cities: string[],
  location: string | undefined,
): string | undefined {
  if (!location) return undefined;
  const folded = foldForMatch(location);
  let best: { city: string; index: number } | undefined;
  for (const city of cities) {
    const index = folded.indexOf(foldForMatch(city));
    if (index >= 0 && (!best || index < best.index)) best = { city, index };
  }
  return best?.city;
}

export function buildFreeHireLocationEvidence(input: {
  location?: string;
  countries: string[];
  cities: string[];
}): CreateJobInput["locationEvidence"] {
  const { location } = input;
  const country = pickCountry(input.countries, location);
  const city = pickCity(input.cities, location);
  if (!location && !country && !city) return undefined;
  return { location, country, city, source: "freehire" };
}
