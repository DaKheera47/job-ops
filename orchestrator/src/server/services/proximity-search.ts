import type { LocationProximity } from "@shared/types/location.js";

const METRES_PER_MILE = 1609.344;
const MAX_OVERPASS_ELEMENTS = 500;
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// ponytail: cities/towns keep large-radius Overpass queries bounded; add a
// local place dataset if village-level coverage becomes worth the dependency.
const MAX_QUERY_PLACES = 25;

type OverpassElement = {
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string | undefined>;
};

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

export async function resolveNearbyPlaceNames(
  proximity: LocationProximity,
  fetchImpl: typeof fetch = fetch,
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

  try {
    const params = new URLSearchParams({
      format: "jsonv2",
      lat: String(proximity.latitude),
      lon: String(proximity.longitude),
      zoom: "10",
      addressdetails: "1",
    });
    const response = await fetchImpl(
      `https://nominatim.openstreetmap.org/reverse?${params}`,
      {
        headers: { "user-agent": "job-ops/1.0 proximity-search" },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (response.ok) {
      const reverse = (await response.json()) as {
        address?: Record<string, string | undefined>;
      };
      const name =
        reverse.address?.city ??
        reverse.address?.town ??
        reverse.address?.village ??
        reverse.address?.municipality ??
        reverse.address?.county;
      if (name?.trim()) return [name.trim()];
    }
  } catch {
    // Return the same sanitized error used for unavailable Overpass endpoints.
  }

  throw new Error("Unable to resolve nearby places for the selected map area.");
}
