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

  it("hydrates posted dates from the detail endpoint during fetchJobs", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              meta: { totalCount: 1 },
              result: [
                {
                  id: "134",
                  jobOpeningName: "Onshore Electrical Technician",
                  location: {
                    city: "Thainstone",
                    state: "Aberdeenshire",
                  },
                },
              ],
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              result: {
                jobOpening: {
                  jobOpeningShareUrl:
                    "https://ashteadtechnology.bamboohr.com/careers/134",
                  jobOpeningName: "Onshore Electrical Technician",
                  description: "<p>Testing</p>",
                  datePosted: "2025-03-20",
                  location: {
                    city: "Thainstone",
                    state: "Aberdeenshire",
                    addressCountry: "United Kingdom",
                  },
                },
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json" },
            },
          ),
        ),
    );

    await expect(
      bamboohrWatchlistAdapter.fetchJobs({
        source: {
          id: "selected-ashtead",
          catalogSourceId: null,
          label: "Ashtead Technology",
          sourceType: "bamboohr",
          careersUrl: "https://ashteadtechnology.bamboohr.com/careers",
          cxsJobsUrl: null,
          isCustom: true,
          sortOrder: 0,
          createdAt: "2026-05-20T00:00:00.000Z",
          updatedAt: "2026-05-20T00:00:00.000Z",
        },
      }),
    ).resolves.toMatchObject({
      total: 1,
      fetched: 1,
      jobs: [
        expect.objectContaining({
          sourceJobId: "134",
          jobUrl: "https://ashteadtechnology.bamboohr.com/careers/134",
          location: "Thainstone, Aberdeenshire, United Kingdom",
          postedAt: "2025-03-20",
        }),
      ],
    });
  });

  it("sorts fetched jobs by latest posted date and keeps only 40", async () => {
    const listJobs = Array.from({ length: 41 }, (_, index) => ({
      id: String(index + 1),
      jobOpeningName: `Role ${index + 1}`,
    }));

    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          meta: { totalCount: listJobs.length },
          result: listJobs,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    for (let index = 0; index < listJobs.length; index += 1) {
      const jobId = String(index + 1);
      const postedAt = new Date(Date.UTC(2025, 2, index + 1))
        .toISOString()
        .slice(0, 10);
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            result: {
              jobOpening: {
                jobOpeningShareUrl: `https://ashteadtechnology.bamboohr.com/careers/${jobId}`,
                jobOpeningName: `Role ${jobId}`,
                description: "<p>Testing</p>",
                datePosted: postedAt,
              },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      );
    }

    vi.stubGlobal("fetch", fetchMock);

    const result = await bamboohrWatchlistAdapter.fetchJobs({
      source: {
        id: "selected-ashtead",
        catalogSourceId: null,
        label: "Ashtead Technology",
        sourceType: "bamboohr",
        careersUrl: "https://ashteadtechnology.bamboohr.com/careers",
        cxsJobsUrl: null,
        isCustom: true,
        sortOrder: 0,
        createdAt: "2026-05-20T00:00:00.000Z",
        updatedAt: "2026-05-20T00:00:00.000Z",
      },
    });

    expect(result.total).toBe(41);
    expect(result.fetched).toBe(40);
    expect(result.jobs).toHaveLength(40);
    expect(result.jobs[0]).toMatchObject({
      sourceJobId: "41",
      postedAt: "2025-04-10",
    });
    expect(result.jobs.at(-1)).toMatchObject({
      sourceJobId: "2",
      postedAt: "2025-03-02",
    });
  });
});
