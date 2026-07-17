import { normalizeCountryKey } from "@shared/location-support.js";
import type { LocationProximity } from "@shared/types/location.js";
import PQueue from "p-queue";

const METRES_PER_MILE = 1609.344;
const MAX_OVERPASS_ELEMENTS = 500;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// ponytail: cities/towns keep large-radius Overpass queries bounded; add a
// local place dataset if village-level coverage becomes worth the dependency.
const MAX_QUERY_PLACES = 25;
const nearbyPlacesCache = new Map<string, Promise<string[]>>();
const nominatimQueue = new PQueue({
  concurrency: 1,
  intervalCap: 1,
  interval: 1_000,
  carryoverConcurrencyCount: true,
});

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

async function reverseGeocodeAddress(
  point: Pick<LocationProximity, "latitude" | "longitude">,
  fetchImpl: typeof fetch,
): Promise<Record<string, string | undefined> | null> {
  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(point.latitude),
      lon: String(point.longitude),
      zoom: "10",
      addressdetails: "1",
      "accept-language": "en",
    });
    const request = () =>
      fetchImpl(`https://nominatim.openstreetmap.org/reverse?${params}`, {
        headers: { "user-agent": "job-ops/1.0 proximity-search" },
        signal: AbortSignal.timeout(15_000),
      });
    const response =
      fetchImpl === fetch ? await nominatimQueue.add(request) : await request();
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      address?: Record<string, string | undefined>;
    };
    return payload.address ?? null;
  } catch {
    return null;
  }
}

export async function resolveCountryAtPoint(
  point: Pick<LocationProximity, "latitude" | "longitude">,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const address = await reverseGeocodeAddress(point, fetchImpl);
  const countryCode = address?.country_code?.trim().toUpperCase();
  const countryName = countryCode
    ? new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode)
    : address?.country;
  const country = normalizeCountryKey(countryName);
  if (country) return country;
  throw new Error("Unable to detect the country at the selected map point.");
}

export function distanceMiles(
  from: Pick<LocationProximity, "latitude" | "longitude">,
  to: Pick<LocationProximity, "latitude" | "longitude">,
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchNearbyPlaceNames(
  proximity: LocationProximity,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  const radiusMetres = Math.round(proximity.radiusMiles * METRES_PER_MILE);
  const query = `[out:json][timeout:12];node(around:${radiusMetres},${proximity.latitude},${proximity.longitude})[place~"^(city|town)$"][name];out body ${MAX_OVERPASS_ELEMENTS};`;
  let payload: { elements?: OverpassElement[] } | null = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": "job-ops/1.0 proximity-search",
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) continue;
      payload = (await response.json()) as { elements?: OverpassElement[] };
      break;
    } catch {
      // Try the next public Overpass endpoint before returning a sanitized error.
    }
  }

  const places = new Map<
    string,
    { name: string; distance: number; population: number }
  >();

  for (const element of payload?.elements ?? []) {
    const name = element.tags?.["name:en"] ?? element.tags?.name;
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (!name || latitude == null || longitude == null) continue;

    const distance = distanceMiles(proximity, {
      latitude,
      longitude,
    });
    if (distance > proximity.radiusMiles) continue;

    const key = name.trim().toLowerCase();
    if (!key) continue;
    const population =
      Number.parseInt(element.tags?.population ?? "0", 10) || 0;
    const existing = places.get(key);
    if (!existing || distance < existing.distance) {
      places.set(key, { name: name.trim(), distance, population });
    }
  }

  const ordered = Array.from(places.values()).sort(
    (left, right) => left.distance - right.distance,
  );
  const nearest = ordered.shift();
  ordered.sort(
    (left, right) =>
      right.population - left.population || left.distance - right.distance,
  );

  const result = [nearest, ...ordered]
    .filter((place): place is NonNullable<typeof place> => Boolean(place))
    .slice(0, MAX_QUERY_PLACES)
    .map((place) => place.name);

  if (result.length > 0) return result;

  const address = await reverseGeocodeAddress(proximity, fetchImpl);
  const name =
    address?.city ??
    address?.town ??
    address?.village ??
    address?.municipality ??
    address?.county;
  if (name?.trim()) return [name.trim()];

  throw new Error("Unable to resolve nearby places for the selected map area.");
}

export async function resolveNearbyPlaceNames(
  proximity: LocationProximity,
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  if (fetchImpl !== fetch) return fetchNearbyPlaceNames(proximity, fetchImpl);

  const key = `${proximity.latitude},${proximity.longitude},${proximity.radiusMiles}`;
  const cached = nearbyPlacesCache.get(key);
  if (cached) return cached;

  const request = fetchNearbyPlaceNames(proximity, fetchImpl).catch((error) => {
    nearbyPlacesCache.delete(key);
    throw error;
  });
  nearbyPlacesCache.set(key, request);
  if (nearbyPlacesCache.size > 100) {
    nearbyPlacesCache.delete(nearbyPlacesCache.keys().next().value as string);
  }
  return request;
}
