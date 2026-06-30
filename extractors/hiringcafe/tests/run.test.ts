import { describe, expect, it, vi } from "vitest";
import {
  buildHiringCafeSearchUrl,
  parseHiringCafeJobDetailPage,
  parseHiringCafeSsrPage,
  runHiringCafe,
} from "../src/run";

function createTextResponse(
  body: string,
  init: Partial<Response> = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    text: async () => body,
  } as Response;
}

function createJsonResponse(
  body: unknown,
  init: Partial<Response> = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function createSearchHtml(hits: unknown[], isLastPage = true): string {
  return `
    <!doctype html>
    <script id="__NEXT_DATA__" type="application/json">
      ${JSON.stringify({
        props: {
          pageProps: {
            ssrHits: hits,
            ssrPage: 0,
            ssrTotalCount: hits.length,
            ssrPageSize: 40,
            ssrIsLastPage: isLastPage,
            ssrError: null,
          },
        },
      })}
    </script>
  `;
}

function createJobDetailHtml(job: unknown): string {
  return `
    <!doctype html>
    <script id="__NEXT_DATA__" type="application/json">
      ${JSON.stringify({
        props: {
          pageProps: {
            job,
          },
        },
        page: "/job/[requisitionId]",
        query: {
          requisitionId: "req-1",
        },
      })}
    </script>
  `;
}

function createExpiredJobDetailHtml(): string {
  return `
    <!doctype html>
    <html>
      <head>
        <title>HiringCafe - Expired Job</title>
      </head>
      <body>
        <h1>Expired Job</h1>
        <p>We're sorry, but this job has expired.</p>
        <script>window.__hcAsset = "challenge-platform";</script>
      </body>
    </html>
  `;
}

function createRawJob(overrides: Record<string, unknown> = {}) {
  return {
    original_source_id: "job-1",
    apply_url: "https://example.com/apply/job-1",
    job_information: {
      title: "Web Developer",
      description: "Build useful web things.",
    },
    v5_processed_job_data: {
      company_name: "Acme",
      formatted_workplace_location: "London, England, United Kingdom",
      workplace_cities: ["London, England, GB"],
      workplace_states: ["England, GB"],
      workplace_countries: ["GB"],
      commitment: ["Full Time"],
      workplace_type: "Hybrid",
      estimated_publish_date: "2026-03-27T09:38:18.396Z",
      yearly_min_compensation: 50000,
      yearly_max_compensation: 70000,
      listed_compensation_currency: "GBP",
      listed_compensation_frequency: "Yearly",
      technical_tools: ["React", "Next.js"],
    },
    ...overrides,
  };
}

describe("Hiring Cafe SSR parser", () => {
  it("extracts server-rendered hits from __NEXT_DATA__", () => {
    const page = parseHiringCafeSsrPage(createSearchHtml([createRawJob()]));

    expect(page.jobs).toHaveLength(1);
    expect(page.totalCount).toBe(1);
    expect(page.isLastPage).toBe(true);
  });

  it("extracts the job payload from a rendered detail page", () => {
    const job = createRawJob({
      requisition_id: "req-1",
      job_information: {
        title: "Web Developer",
        description: "<p>Full job description.</p>",
      },
    });

    const parsed = parseHiringCafeJobDetailPage(createJobDetailHtml(job));

    expect(parsed).toMatchObject({
      requisition_id: "req-1",
      job_information: expect.objectContaining({
        description: "<p>Full job description.</p>",
      }),
    });
  });

  it("returns null for an expired detail page", () => {
    expect(
      parseHiringCafeJobDetailPage(createExpiredJobDetailHtml()),
    ).toBeNull();
  });

  it("builds the public search URL with url-encoded JSON state", () => {
    const url = new URL(
      buildHiringCafeSearchUrl({
        searchState: { searchQuery: "web developer" },
        pageNo: 1,
      }),
    );

    expect(url.origin).toBe("https://hiring.cafe");
    expect(url.searchParams.get("searchState")).toBe(
      JSON.stringify({ searchQuery: "web developer" }),
    );
    expect(url.searchParams.get("page")).toBe("1");
  });
});

describe("runHiringCafe", () => {
  it("fetches rendered search pages and maps jobs without a browser", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        createTextResponse(createSearchHtml([createRawJob()])),
      );

    const result = await runHiringCafe({
      searchTerms: ["web developer"],
      country: "worldwide",
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toEqual([
      expect.objectContaining({
        source: "hiringcafe",
        sourceJobId: "job-1",
        title: "Web Developer",
        employer: "Acme",
        jobUrl: "https://example.com/apply/job-1",
        location: "London, England, United Kingdom",
        salary: "GBP 50000-70000 / Yearly",
        skills: "React, Next.js",
      }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("https://hiring.cafe/"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "user-agent": "Mozilla/5.0 (compatible; JobOps/1.0)",
        }),
      }),
    );
  });

  it("fetches the job detail page when the search hit omits the full description", async () => {
    const baseJob = createRawJob();
    const searchHit = createRawJob({
      requisition_id: "req-1",
      job_information: {
        title: "Web Developer",
      },
      v5_processed_job_data: {
        ...baseJob.v5_processed_job_data,
        requirements_summary: "Short requirements summary.",
      },
    });
    const detailJob = {
      ...searchHit,
      job_information: {
        title: "Web Developer",
        description: "<p>Full detail page description.</p>",
      },
    };
    const fetchMock = vi.fn((url: string) => {
      if (url === "https://hiring.cafe/job/req-1") {
        return Promise.resolve(
          createTextResponse(createJobDetailHtml(detailJob)),
        );
      }

      return Promise.resolve(createTextResponse(createSearchHtml([searchHit])));
    });

    const result = await runHiringCafe({
      searchTerms: ["web developer"],
      country: "worldwide",
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.jobs[0]).toMatchObject({
      sourceJobId: "job-1",
      jobDescription: "<p>Full detail page description.</p>",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://hiring.cafe/job/req-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          "user-agent": "Mozilla/5.0 (compatible; JobOps/1.0)",
        }),
      }),
    );
  });

  it("surfaces the challenged detail page URL when enrichment hits a challenge", async () => {
    const searchHit = createRawJob({
      requisition_id: "req-1",
      job_information: {
        title: "Web Developer",
      },
    });
    const fetchMock = vi.fn((url: string) => {
      if (url === "https://hiring.cafe/job/req-1") {
        return Promise.resolve(
          createTextResponse("<html>challenges.cloudflare.com</html>"),
        );
      }

      return Promise.resolve(createTextResponse(createSearchHtml([searchHit])));
    });

    const result = await runHiringCafe({
      searchTerms: ["web developer"],
      country: "worldwide",
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result).toMatchObject({
      success: false,
      challengeRequired: "https://hiring.cafe/job/req-1",
    });
  });

  it("falls back to the search hit when enrichment finds an expired job", async () => {
    const searchHit = createRawJob({
      requisition_id: "req-1",
      job_information: {
        title: "Web Developer",
      },
    });
    const fetchMock = vi.fn((url: string) => {
      if (url === "https://hiring.cafe/job/req-1") {
        return Promise.resolve(
          createTextResponse(createExpiredJobDetailHtml()),
        );
      }

      return Promise.resolve(createTextResponse(createSearchHtml([searchHit])));
    });

    const result = await runHiringCafe({
      searchTerms: ["web developer"],
      country: "worldwide",
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result).toMatchObject({
      success: true,
      jobs: [
        expect.objectContaining({
          sourceJobId: "job-1",
          title: "Web Developer",
        }),
      ],
    });
    expect(result.challengeRequired).toBeUndefined();
  });

  it("serializes locality search state for strict city filters", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.startsWith("https://nominatim.openstreetmap.org/search")) {
        return Promise.resolve(
          createJsonResponse([
            {
              lat: "51.50853",
              lon: "-0.12574",
              display_name: "London, England, GB",
              address: { state: "England" },
            },
          ]),
        );
      }

      return Promise.resolve(createTextResponse(createSearchHtml([])));
    });

    await runHiringCafe({
      searchTerms: ["web developer"],
      country: "United Kingdom",
      countryKey: "united kingdom",
      locations: ["London"],
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock as typeof fetch,
    });

    const searchCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith("https://hiring.cafe/"),
    );
    const url = new URL(String(searchCall?.[0]));
    const searchState = JSON.parse(
      url.searchParams.get("searchState") ?? "{}",
    ) as Record<string, unknown>;
    const locations = searchState.locations as Array<Record<string, unknown>>;
    const firstLocation = locations[0];

    expect(firstLocation).toMatchObject({
      types: ["locality"],
      formatted_address: "London, England, GB",
      options: {
        radius: 50,
        radius_unit: "miles",
        ignore_radius: false,
      },
    });
  });
});
