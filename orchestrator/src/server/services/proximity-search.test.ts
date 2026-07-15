import { describe, expect, it, vi } from "vitest";
import { distanceMiles, resolveNearbyPlaceNames } from "./proximity-search";

describe("proximity search", () => {
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
    expect(decodeURIComponent(String(request?.body))).toContain(
      "out center 500",
    );
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
    expect(fetchImpl).toHaveBeenCalledTimes(2);
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
});
