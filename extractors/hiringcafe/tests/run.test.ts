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

    expect(url.origin).toBe("https://hiringcafe.com");
    expect(url.searchParams.get("searchState")).toBe(
      JSON.stringify({ searchQuery: "web developer" }),
    );
    expect(url.searchParams.get("page")).toBe("1");
  });
});

describe("runHiringCafe", () => {
  it("keeps an earlier detail challenge pending when resuming a later search page", async () => {
    let searchPageClear = false;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "https://hiringcafe.com/job/req-1") {
        return createTextResponse("<html>challenges.cloudflare.com</html>", {
          ok: false,
          status: 403,
        });
      }
      const page = Number(new URL(url).searchParams.get("page") ?? 0);
      if (page === 1 && !searchPageClear) {
        return createTextResponse("<html>challenges.cloudflare.com</html>", {
          ok: false,
          status: 403,
        });
      }
      const hit =
        page === 0
          ? createRawJob({
              requisition_id: "req-1",
              job_information: { title: "Engineer 1" },
            })
          : createRawJob({
              original_source_id: "job-2",
              apply_url: "https://example.com/apply/job-2",
            });
      return createTextResponse(createSearchHtml([hit], page === 1));
    });
    const options = {
      searchTerms: ["Backend Engineer"],
      country: "worldwide",
      maxJobsPerTerm: 2,
      fetchImpl: fetchMock as typeof fetch,
    };

    const first = await runHiringCafe(options);
    expect(first.challengeRequired).toContain("page=1");
    expect(first.searchResume?.pendingDetailChallengeUrl).toBe(
      "https://hiringcafe.com/job/req-1",
    );

    searchPageClear = true;
    const resumed = await runHiringCafe({
      ...options,
      searchResume: first.searchResume,
    });
    expect(resumed.challengeRequired).toBe("https://hiringcafe.com/job/req-1");
    expect(resumed.jobs.map((job) => job.sourceJobId)).toEqual(["job-2"]);
  });

  it("does not count a previously seen listing against the remaining term limit", async () => {
    const fetchMock = vi.fn(async () =>
      createTextResponse(
        createSearchHtml([
          createRawJob({ original_source_id: "job-1" }),
          createRawJob({
            original_source_id: "job-3",
            apply_url: "https://example.com/apply/job-3",
          }),
        ]),
      ),
    );
    const result = await runHiringCafe({
      searchTerms: ["Backend Engineer"],
      country: "worldwide",
      maxJobsPerTerm: 3,
      fetchImpl: fetchMock as typeof fetch,
      searchResume: {
        locationIndex: 0,
        termIndex: 0,
        location: null,
        searchTerm: "Backend Engineer",
        pageNo: 2,
        termCollected: 2,
        searchState: '{"searchQuery":"Backend Engineer"}',
        seenKeys: ["job-1", "job-2"],
      },
    });

    expect(result.jobs.map((job) => job.sourceJobId)).toEqual(["job-3"]);
    expect(
      new URL(
        fetchMock.mock.calls[0]?.[0] ?? "https://hiringcafe.com/",
      ).searchParams.get("page"),
    ).toBe("2");
  });

  it("rejects a stale search checkpoint instead of silently completing an empty retry", async () => {
    const pageReader = { read: vi.fn() };
    const result = await runHiringCafe({
      searchTerms: ["Backend Engineer"],
      country: "worldwide",
      pageReader,
      searchResume: {
        locationIndex: 0,
        termIndex: 3,
        location: null,
        searchTerm: "Backend Engineer",
        pageNo: 2,
        termCollected: 40,
        searchState: '{"searchQuery":"Backend Engineer"}',
        seenKeys: [],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("search checkpoint");
    expect(pageReader.read).not.toHaveBeenCalled();
  });

  it("resumes a challenged city search at its page without replaying earlier terms or cities", async () => {
    const requestedSearchPages: string[] = [];
    let challengePageTwo = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("https://nominatim.openstreetmap.org/search")) {
        const city = new URL(url).searchParams.get("q")?.split(",")[0];
        return createJsonResponse([
          {
            lat: city === "Amsterdam" ? "52.3730796" : "51.9244",
            lon: city === "Amsterdam" ? "4.8924534" : "4.4777",
            display_name: `${city}, Netherlands`,
            address: { state: "Noord-Holland" },
          },
        ]);
      }
      requestedSearchPages.push(url);
      const parsed = new URL(url);
      const state = JSON.parse(
        parsed.searchParams.get("searchState") ?? "{}",
      ) as {
        searchQuery: string;
        locations: Array<{ id: string }>;
      };
      const page = Number(parsed.searchParams.get("page") ?? 0);
      if (
        challengePageTwo &&
        state.searchQuery === "Backend Engineer" &&
        state.locations[0]?.id === "city_amsterdam" &&
        page === 2
      ) {
        return createTextResponse("<html>challenges.cloudflare.com</html>", {
          ok: false,
          status: 403,
        });
      }
      return createTextResponse(
        createSearchHtml(
          [
            createRawJob({
              original_source_id: `${state.locations[0]?.id}-${state.searchQuery}-${page}`,
              apply_url: `https://example.com/${state.locations[0]?.id}/${state.searchQuery}/${page}`,
            }),
          ],
          page >= 3,
        ),
      );
    });
    const options = {
      searchTerms: ["Frontend Engineer", "Backend Engineer", "Data Engineer"],
      country: "Netherlands",
      locations: ["Amsterdam", "Rotterdam"],
      maxJobsPerTerm: 4,
      fetchImpl: fetchMock as typeof fetch,
    };

    const first = await runHiringCafe(options);
    expect(first.challengeRequired).toContain("page=2");
    expect(first.searchResume).toMatchObject({
      locationIndex: 0,
      termIndex: 1,
      pageNo: 2,
      searchTerm: "Backend Engineer",
      location: "Amsterdam",
      termCollected: 2,
    });

    requestedSearchPages.length = 0;
    const challengedAgain = await runHiringCafe({
      ...options,
      searchResume: first.searchResume,
    });
    expect(requestedSearchPages).toHaveLength(1);
    expect(
      new URL(
        requestedSearchPages[0] ?? "https://hiringcafe.com/",
      ).searchParams.get("page"),
    ).toBe("2");
    expect(challengedAgain.searchResume).toEqual(first.searchResume);

    challengePageTwo = false;
    requestedSearchPages.length = 0;
    const resumed = await runHiringCafe({
      ...options,
      searchResume: challengedAgain.searchResume,
    });

    expect(resumed.challengeRequired).toBeUndefined();
    const searches = requestedSearchPages.map((url) => {
      const parsed = new URL(url);
      const state = JSON.parse(
        parsed.searchParams.get("searchState") ?? "{}",
      ) as {
        searchQuery: string;
        locations: Array<{ id: string }>;
      };
      return `${state.locations[0]?.id}:${state.searchQuery}:${parsed.searchParams.get("page") ?? "0"}`;
    });
    expect(searches).toEqual([
      "city_amsterdam:Backend Engineer:2",
      "city_amsterdam:Backend Engineer:3",
      "city_amsterdam:Data Engineer:0",
      "city_amsterdam:Data Engineer:1",
      "city_amsterdam:Data Engineer:2",
      "city_amsterdam:Data Engineer:3",
      "city_rotterdam:Frontend Engineer:0",
      "city_rotterdam:Frontend Engineer:1",
      "city_rotterdam:Frontend Engineer:2",
      "city_rotterdam:Frontend Engineer:3",
      "city_rotterdam:Backend Engineer:0",
      "city_rotterdam:Backend Engineer:1",
      "city_rotterdam:Backend Engineer:2",
      "city_rotterdam:Backend Engineer:3",
      "city_rotterdam:Data Engineer:0",
      "city_rotterdam:Data Engineer:1",
      "city_rotterdam:Data Engineer:2",
      "city_rotterdam:Data Engineer:3",
    ]);
  });
  it("uses browser page HTML for Hiring Cafe without an HTTP request", async () => {
    const pageReader = {
      read: vi.fn(async () => ({
        status: 200,
        html: createSearchHtml([createRawJob()]),
        challenged: false,
      })),
    };
    const fetchMock = vi.fn(async () => {
      throw new Error("HTTP scraper must not read Hiring Cafe pages");
    });

    const result = await runHiringCafe({
      searchTerms: ["web developer"],
      country: "worldwide",
      maxJobsPerTerm: 1,
      pageReader,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.jobs).toEqual([
      expect.objectContaining({ sourceJobId: "job-1" }),
    ]);
    expect(pageReader.read).toHaveBeenCalledOnce();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps jobs from earlier search terms when a later search is challenged", async () => {
    const fetchMock = vi.fn((url: string) => {
      const searchState = JSON.parse(
        new URL(url).searchParams.get("searchState") ?? "{}",
      ) as { searchQuery?: string };
      return Promise.resolve(
        searchState.searchQuery === "backend engineer"
          ? createTextResponse("<html>challenges.cloudflare.com</html>", {
              ok: false,
              status: 429,
            })
          : createTextResponse(createSearchHtml([createRawJob()])),
      );
    });

    const result = await runHiringCafe({
      searchTerms: ["web developer", "backend engineer"],
      country: "worldwide",
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toEqual([
      expect.objectContaining({ sourceJobId: "job-1" }),
    ]);
    expect(result.sourceErrors).toEqual([expect.stringContaining("HTTP 429")]);
    expect(
      new URL(
        result.challengeRequired ?? "https://hiringcafe.com/",
      ).searchParams.get("searchState"),
    ).toContain("backend engineer");
  });

  it("skips only the challenged search and continues with later terms", async () => {
    let challengeSecondTerm = true;
    const fetchedTerms: string[] = [];
    const fetchMock = vi.fn((url: string) => {
      const searchState = JSON.parse(
        new URL(url).searchParams.get("searchState") ?? "{}",
      ) as { searchQuery?: string };
      const term = searchState.searchQuery ?? "";
      fetchedTerms.push(term);
      if (term === "backend engineer" && challengeSecondTerm) {
        return Promise.resolve(
          createTextResponse("<html>challenges.cloudflare.com</html>", {
            ok: false,
            status: 429,
          }),
        );
      }
      const id = term === "web developer" ? "job-1" : "job-3";
      return Promise.resolve(
        createTextResponse(
          createSearchHtml([
            createRawJob({
              original_source_id: id,
              apply_url: `https://example.com/apply/${id}`,
            }),
          ]),
        ),
      );
    });
    const options = {
      searchTerms: ["web developer", "backend engineer", "data engineer"],
      country: "worldwide",
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock as typeof fetch,
    };
    const first = await runHiringCafe(options);
    expect(first.jobs.map((job) => job.sourceJobId)).toEqual(["job-1"]);
    const challengedState = new URL(
      first.challengeRequired ?? "https://hiringcafe.com/",
    ).searchParams.get("searchState");
    expect(challengedState).toBeTruthy();

    challengeSecondTerm = false;
    fetchedTerms.length = 0;
    const resumed = await runHiringCafe({
      ...options,
      skippedChallengeSearchStates: [challengedState ?? ""],
    });
    expect(resumed.success).toBe(true);
    expect(resumed.challengeRequired).toBeUndefined();
    expect(fetchedTerms).toEqual(["web developer", "data engineer"]);
    expect(resumed.jobs.map((job) => job.sourceJobId)).toEqual([
      "job-1",
      "job-3",
    ]);
  });

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
      expect.stringContaining("https://hiringcafe.com/"),
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: expect.stringContaining("text/html"),
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
      if (url === "https://hiringcafe.com/job/req-1") {
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
      "https://hiringcafe.com/job/req-1",
      expect.objectContaining({
        headers: expect.objectContaining({
          accept: expect.stringContaining("text/html"),
        }),
      }),
    );
  });

  it("keeps listing jobs and requests a solve after a detail challenge", async () => {
    const searchHits = ["req-1", "req-2", "req-3"].map((id) =>
      createRawJob({
        original_source_id: id,
        requisition_id: id,
        job_information: { title: `Developer ${id}` },
        v5_processed_job_data: {
          ...createRawJob().v5_processed_job_data,
          requirements_summary: `Summary ${id}`,
        },
      }),
    );
    const fetchMock = vi.fn((url: string) => {
      if (url === "https://hiringcafe.com/job/req-1") {
        return Promise.resolve(
          createTextResponse(
            createJobDetailHtml({
              ...searchHits[0],
              job_information: {
                title: "Developer req-1",
                description: "Full description",
              },
            }),
          ),
        );
      }
      if (url === "https://hiringcafe.com/job/req-2") {
        return Promise.resolve(
          createTextResponse("<html>challenges.cloudflare.com</html>", {
            ok: false,
            status: 429,
          }),
        );
      }

      return Promise.resolve(createTextResponse(createSearchHtml(searchHits)));
    });

    const result = await runHiringCafe({
      searchTerms: ["web developer"],
      country: "worldwide",
      maxJobsPerTerm: 3,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result).toMatchObject({
      success: true,
      jobs: [
        { sourceJobId: "req-1", jobDescription: "Full description" },
        { sourceJobId: "req-2", jobDescription: "Summary req-2" },
        { sourceJobId: "req-3", jobDescription: "Summary req-3" },
      ],
      sourceErrors: [expect.stringContaining("HTTP 429")],
    });
    expect(result.challengeRequired).toBe("https://hiringcafe.com/job/req-2");
    expect(fetchMock).not.toHaveBeenCalledWith(
      "https://hiringcafe.com/job/req-3",
      expect.anything(),
    );
  });

  it("records the status when a detail request returns a challenge page with HTTP 200", async () => {
    const searchHit = createRawJob({
      requisition_id: "req-1",
      job_information: { title: "Web Developer" },
    });
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url === "https://hiringcafe.com/job/req-1"
          ? createTextResponse("<html>challenges.cloudflare.com</html>")
          : createTextResponse(createSearchHtml([searchHit])),
      ),
    );

    const result = await runHiringCafe({
      searchTerms: ["web developer"],
      country: "worldwide",
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.sourceErrors).toEqual([expect.stringContaining("HTTP 200")]);
    expect(result.challengeRequired).toBe("https://hiringcafe.com/job/req-1");
  });

  it("retains a retried detail when its listing moved out of the search page", async () => {
    const detailJob = createRawJob({
      original_source_id: "job-old",
      requisition_id: "req-old",
      job_information: {
        title: "Web Developer",
        description: "Full description after solve",
      },
    });
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve(
        url === "https://hiringcafe.com/job/req-old"
          ? createTextResponse(createJobDetailHtml(detailJob))
          : createTextResponse(createSearchHtml([])),
      ),
    );

    const result = await runHiringCafe({
      searchTerms: ["web developer"],
      country: "worldwide",
      maxJobsPerTerm: 1,
      retryChallengeUrl: "https://hiringcafe.com/job/req-old",
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://hiringcafe.com/job/req-old",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      success: true,
      jobs: [
        {
          sourceJobId: "job-old",
          jobDescription: "Full description after solve",
        },
      ],
    });
    expect(result.challengeRequired).toBeUndefined();
  });

  it("retries a browser-reported 429 before asking for a search challenge", async () => {
    vi.useFakeTimers();
    try {
      let reads = 0;
      const pageReader = {
        read: vi.fn(async () => {
          reads += 1;
          return reads === 1
            ? {
                status: 429,
                html: "<html>Just a moment...</html>",
                challenged: true,
              }
            : { status: 200, html: createSearchHtml([]), challenged: false };
        }),
      };

      const run = runHiringCafe({
        searchTerms: ["web developer"],
        country: "worldwide",
        maxJobsPerTerm: 1,
        pageReader,
      });
      await vi.runAllTimersAsync();
      const result = await run;

      expect(result.success).toBe(true);
      expect(result.challengeRequired).toBeUndefined();
      expect(pageReader.read).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to the search hit when enrichment finds an expired job", async () => {
    const searchHit = createRawJob({
      requisition_id: "req-1",
      job_information: {
        title: "Web Developer",
      },
    });
    const fetchMock = vi.fn((url: string) => {
      if (url === "https://hiringcafe.com/job/req-1") {
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
      String(url).startsWith("https://hiringcafe.com/"),
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

  it("serializes the selected map point and radius without geocoding a city", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(createTextResponse(createSearchHtml([]))),
    );

    await runHiringCafe({
      searchTerms: ["web developer"],
      country: "United Kingdom",
      countryKey: "united kingdom",
      locations: ["Leeds"],
      proximity: {
        latitude: 53.8008,
        longitude: -1.5491,
        radiusMiles: 30,
      },
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock as typeof fetch,
    });

    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).startsWith("https://nominatim.openstreetmap.org/search"),
      ),
    ).toBe(false);
    const searchCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith("https://hiringcafe.com/"),
    );
    const url = new URL(String(searchCall?.[0]));
    const searchState = JSON.parse(
      url.searchParams.get("searchState") ?? "{}",
    ) as Record<string, unknown>;
    const locations = searchState.locations as Array<{
      geometry?: { location?: { lat?: number; lon?: number } };
      options?: { radius?: number; radius_unit?: string };
    }>;

    expect(locations[0]).toMatchObject({
      geometry: { location: { lat: 53.8008, lon: -1.5491 } },
      options: { radius: 30, radius_unit: "miles" },
    });
  });
});
