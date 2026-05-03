import { describe, expect, it, vi } from "vitest";
import {
  buildJobindexSearchUrl,
  extractJobindexSearchResponse,
  extractJobindexStoreData,
  mapJobindexResult,
  resolveGeoareaIds,
  runJobindex,
} from "../src/run";

function createHtml(
  results: unknown[],
  totalPages = 1,
  extraStoreData: Record<string, unknown> = {},
): string {
  return `<script>
    var Stash = {"jobsearch/result_app":{"storeData":${JSON.stringify({
      ...extraStoreData,
      searchResponse: { results, total_pages: totalPages, page_size: 20 },
    })}}};
  </script>`;
}

function createResponse(html: string): Response {
  return {
    ok: true,
    status: 200,
    text: async () => html,
  } as Response;
}

describe("Jobindex Stash parsing", () => {
  it("extracts embedded storeData values beyond searchResponse", () => {
    const storeData = extractJobindexStoreData(
      createHtml([], 1, {
        geoareaOptions: [{ id: 74, text: "Odsherred", typeid: 30 }],
      }),
    );

    expect(storeData.geoareaOptions).toEqual([
      { id: 74, text: "Odsherred", typeid: 30 },
    ]);
  });

  it("extracts the embedded searchResponse payload", () => {
    const response = extractJobindexSearchResponse(
      createHtml([{ tid: "h1", headline: "Software Engineer" }], 2),
    );

    expect(response.total_pages).toBe(2);
    expect(response.results).toEqual([
      { tid: "h1", headline: "Software Engineer" },
    ]);
  });

  it("builds query-only search URLs and adds page after the first page", () => {
    expect(buildJobindexSearchUrl("software engineering", 1)).toBe(
      "https://www.jobindex.dk/jobsoegning?q=software+engineering",
    );
    expect(buildJobindexSearchUrl("software engineering", 2)).toBe(
      "https://www.jobindex.dk/jobsoegning?q=software+engineering&page=2",
    );
  });

  it("builds location-aware search URLs with repeated geoareaid filters", () => {
    expect(buildJobindexSearchUrl("software engineering", 1, [74, 56])).toBe(
      "https://www.jobindex.dk/jobsoegning?q=software+engineering&geoareaid=74&geoareaid=56",
    );
  });
});

describe("resolveGeoareaIds", () => {
  it("prefers kommune entries and matches diacritic-insensitively", () => {
    expect(
      resolveGeoareaIds(
        ["odsherred", "Kobenhavn"],
        [
          { id: 15182, text: "Storkobenhavn", typeid: 0 },
          { id: 56, text: "Kobenhavn", typeid: 30 },
          { id: 74, text: "Odsherred", typeid: 30 },
        ],
      ),
    ).toEqual([74, 56]);
  });
});

describe("mapJobindexResult", () => {
  it("maps Stash result rows into normalized jobs", () => {
    const mapped = mapJobindexResult({
      tid: "h1661330",
      headline: "Software Engineer",
      companytext: "Karnov Group Denmark A/S",
      share_url: "https://www.jobindex.dk/vis-job/h1661330",
      url: "https://www.jobindex.dk/c?t=h1661330&ctx=w",
      firstdate: "2026-05-01",
      lastdate: "2026-05-29",
      area: "Copenhagen",
      home_workplace: false,
      addresses: [
        {
          city: "Kobenhavn K",
          coordinates: { latitude: 55.68065234, longitude: 12.5703325 },
          simple_string: "Sankt Petri Passage 5, 1165 Kobenhavn K",
        },
      ],
      company: {
        homeurl: "https://www.karnovgroup.dk/",
        logo: "https://www.jobindex.dk/img/logo/karnov.gif",
        name: "Karnov Group Denmark A/S",
      },
      html: '<h4><a href="https://example.com/apply?x=1&amp;y=2">Software Engineer</a></h4><p>You&rsquo;ll build pipelines.</p>',
      rating: { ratings: 10, score: 4.5 },
    });

    expect(mapped).toEqual(
      expect.objectContaining({
        source: "jobindex",
        sourceJobId: "h1661330",
        title: "Software Engineer",
        employer: "Karnov Group Denmark A/S",
        jobUrl: "https://www.jobindex.dk/vis-job/h1661330",
        applicationLink: "https://example.com/apply?x=1&y=2",
        location: "Sankt Petri Passage 5, 1165 Kobenhavn K",
        datePosted: "2026-05-01",
        deadline: "2026-05-29",
        jobDescription: "You'll build pipelines.",
        companyRating: 4.5,
        companyReviewsCount: 10,
      }),
    );
    expect(mapped?.locationEvidence).toEqual(
      expect.objectContaining({
        country: "denmark",
        city: "Kobenhavn K",
        sourceNotes: ["coordinates:55.68065234,12.5703325"],
      }),
    );
  });
});

describe("runJobindex", () => {
  it("fetches Denmark query results and respects the per-term cap", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      createResponse(
        createHtml(
          [
            {
              tid: "h1",
              headline: "Backend Engineer",
              companytext: "Acme",
              share_url: "https://www.jobindex.dk/vis-job/h1",
            },
            {
              tid: "h2",
              headline: "Frontend Engineer",
              companytext: "Beta",
              share_url: "https://www.jobindex.dk/vis-job/h2",
            },
          ],
          2,
        ),
      ),
    );

    const result = await runJobindex({
      selectedCountry: "denmark",
      searchTerms: ["software engineering"],
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.sourceJobId).toBe("h1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves city locations into geoareaid filters", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse(
          createHtml([], 1, {
            geoareaOptions: [{ id: 74, text: "Odsherred", typeid: 30 }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        createResponse(
          createHtml([
            {
              tid: "h1",
              headline: "Backend Engineer",
              companytext: "Acme",
              share_url: "https://www.jobindex.dk/vis-job/h1",
            },
          ]),
        ),
      );

    const result = await runJobindex({
      selectedCountry: "denmark",
      searchTerms: ["software engineering"],
      cityLocations: ["Odsherred"],
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://www.jobindex.dk/jobsoegning?q=software+engineering&geoareaid=74",
    );
  });

  it("does not run outside Denmark", async () => {
    const fetchMock = vi.fn();

    const result = await runJobindex({
      selectedCountry: "united kingdom",
      searchTerms: ["software engineering"],
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
