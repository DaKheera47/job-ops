import { afterEach, describe, expect, it, vi } from "vitest";
import {
  distanceMiles,
  resolveCountryAtPoint,
  resolveNearbyPlaceNames,
} from "./proximity-search";

describe("proximity search", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("calculates distance and plans nearby places around the clicked point", async () => {
    expect(
      distanceMiles(
        { latitude: 53.8, longitude: -1.55 },
        { latitude: 53.96, longitude: -1.08 },
      ),
    ).toBeGreaterThan(20);

    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          elements: [
            {
              lat: 53.8,
              lon: -1.55,
              tags: { name: "Leeds", population: "536280" },
            },
            {
              lat: 53.68,
              lon: -1.5,
              tags: { name: "Wakefield", population: "109766" },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(
      resolveNearbyPlaceNames(
        { latitude: 53.8, longitude: -1.55, radiusMiles: 25 },
        fetchImpl,
      ),
    ).resolves.toEqual(["Leeds", "Wakefield"]);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const request = fetchImpl.mock.calls[0]?.[1];
    const query = decodeURIComponent(String(request?.body));
    expect(query).toContain("node(around:");
    expect(query).toContain('place~"^(city|town)$"');
    expect(query).toContain("out body 500");
    expect(query).not.toContain("nwr(");
    expect(query).not.toContain("village");
  });

  it("does not expose upstream response bodies when place lookup fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response("upstream details", {
        status: 429,
      }),
    );

    await expect(
      resolveNearbyPlaceNames(
        { latitude: 53.8, longitude: -1.55, radiusMiles: 25 },
        fetchImpl,
      ),
    ).rejects.toThrow(
      "Unable to resolve nearby places for the selected map area.",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("falls back when the primary Overpass endpoint is unavailable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            elements: [
              {
                lat: 53.8,
                lon: -1.55,
                tags: { name: "Leeds", population: "536280" },
              },
            ],
          }),
          { status: 200 },
        ),
      );

    await expect(
      resolveNearbyPlaceNames(
        { latitude: 53.8, longitude: -1.55, radiusMiles: 25 },
        fetchImpl,
      ),
    ).resolves.toEqual(["Leeds"]);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      "https://overpass.kumi.systems/api/interpreter",
    );
  });

  it("reuses a successful place preview for the pipeline run", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          elements: [{ lat: 51.5074, lon: -0.1278, tags: { name: "London" } }],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchImpl);
    const proximity = {
      latitude: 51.5074,
      longitude: -0.1278,
      radiusMiles: 12,
    };

    await resolveNearbyPlaceNames(proximity);
    await resolveNearbyPlaceNames(proximity);

    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("uses the centre locality when Overpass is unavailable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ address: { village: "Haworth" } }), {
          status: 200,
        }),
      );

    await expect(
      resolveNearbyPlaceNames(
        { latitude: 53.83, longitude: -1.95, radiusMiles: 50 },
        fetchImpl,
      ),
    ).resolves.toEqual(["Haworth"]);
    expect(fetchImpl.mock.calls[2]?.[0]).toContain(
      "https://nominatim.openstreetmap.org/reverse?",
    );
  });

  it("detects the country at the selected point", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          address: { country: "United Kingdom", country_code: "gb" },
        }),
        { status: 200 },
      ),
    );

    await expect(
      resolveCountryAtPoint({ latitude: 53.8, longitude: -1.55 }, fetchImpl),
    ).resolves.toBe("united kingdom");
  });
});
