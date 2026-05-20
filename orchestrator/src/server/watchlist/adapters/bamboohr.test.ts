import { beforeEach, describe, expect, it, vi } from "vitest";
import { bamboohrWatchlistAdapter } from "./bamboohr";

describe("bamboohrWatchlistAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses catalog sources into canonical watchlist sources", () => {
    expect(
      bamboohrWatchlistAdapter.parseCatalogSources([
        {
          label: "Ashtead Technology",
          bamboohrUrl: "https://ashteadtechnology.bamboohr.com/careers/list",
        },
      ]),
    ).toEqual([
      {
        id: "bamboohr:https://ashteadtechnology.bamboohr.com/careers",
        label: "Ashtead Technology",
        sourceType: "bamboohr",
        careersUrl: "https://ashteadtechnology.bamboohr.com/careers",
        cxsJobsUrl: null,
      },
    ]);
  });

  it("normalizes custom selections to the careers root and derived label", () => {
    expect(
      bamboohrWatchlistAdapter.normalizeCustomSelection({
        label: "https://acme-inc.bamboohr.com/careers/list",
        careersUrl: "https://acme-inc.bamboohr.com/careers/list",
      }),
    ).toEqual({
      label: "Acme Inc",
      careersUrl: "https://acme-inc.bamboohr.com/careers",
    });
  });

  it("builds branding responses from company-info and the logo asset", async () => {
    const fetchBranding = bamboohrWatchlistAdapter.fetchBranding;
    if (!fetchBranding) {
      throw new Error("Expected BambooHR branding support to be available.");
    }

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              result: {
                name: "Ashtead Technology",
                logoUrl:
                  "https://images4.bamboohr.com/618032/logos/cropped.jpg?v=28",
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(Uint8Array.from([0xff, 0xd8, 0xff]), {
            status: 200,
            headers: {
              "content-type": "image/jpeg",
              "content-length": "3",
            },
          }),
        ),
    );

    await expect(
      fetchBranding({
        source: {
          sourceType: "bamboohr",
          careersUrl: "https://ashteadtechnology.bamboohr.com/careers",
        },
      }),
    ).resolves.toMatchObject({
      careersUrl: "https://ashteadtechnology.bamboohr.com/careers",
      logoUrl: "https://images4.bamboohr.com/618032/logos/cropped.jpg?v=28",
      mimeType: "image/jpeg",
    });
  });
});
