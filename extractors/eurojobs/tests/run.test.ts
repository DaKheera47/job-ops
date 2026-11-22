import { describe, expect, it, vi } from "vitest";
import {
  buildEuroJobsSearchUrl,
  euroJobsHtmlToText,
  mapEuroJobsJob,
  runEuroJobs,
  toEuroJobsLocationSlug,
} from "../src/run";

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

function row(id: number, extra: Record<string, unknown> = {}) {
  return {
    id: String(id),
    url: `https://eurojobs.ai/jobs/companies/acme/job-${id}`,
    apply_url: `https://eurojobs.ai/apply/${id}?from=api`,
    title: "Software Engineer",
    company_name: "Acme",
    work_mode: "onsite",
    description_snippet: "Short snippet",
    ...extra,
  };
}

function listResponse(rows: unknown[], total = rows.length) {
  return jsonResponse({
    data: rows,
    meta: {
      total,
      page: 1,
      per_page: 100,
      attribution: "Attribution required.",
    },
  });
}

function isDetailCall(input: unknown): boolean {
  return /\/api\/v1\/jobs\/[^/?]+$/.test(String(input));
}

describe("EuroJobs extractor", () => {
  it("builds a filtered public search URL", () => {
    const url = buildEuroJobsSearchUrl({
      searchTerm: "backend engineer",
      selectedCountry: "united kingdom",
      location: "Zürich",
      workplaceTypes: ["remote"],
      page: 2,
      perPage: 250,
    });

    expect(url.origin).toBe("https://eurojobs.ai");
    expect(url.pathname).toBe("/api/v1/jobs");
    expect(url.searchParams.get("q")).toBe("backend engineer");
    expect(url.searchParams.get("country")).toBe("GB");
    expect(url.searchParams.get("location")).toBe("zurich");
    expect(url.searchParams.get("remote")).toBe("true");
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("100");
  });

  it("only sends the remote filter when remote is the only workplace type", () => {
    const url = buildEuroJobsSearchUrl({
      searchTerm: "data engineer",
      selectedCountry: "worldwide",
      workplaceTypes: ["remote", "hybrid"],
      perPage: 50,
    });

    expect(url.searchParams.has("remote")).toBe(false);
    expect(url.searchParams.has("country")).toBe(false);
    expect(url.searchParams.has("location")).toBe(false);
  });

  it("turns city names into EuroJobs slugs", () => {
    expect(toEuroJobsLocationSlug("Kraków")).toBe("krakow");
    expect(toEuroJobsLocationSlug("Frankfurt am Main, Germany")).toBe(
      "frankfurt-am-main",
    );
    expect(toEuroJobsLocationSlug("  ")).toBeUndefined();
  });

  it("maps EuroJobs fields into a normalized job", () => {
    expect(
      mapEuroJobsJob({
        id: "18842",
        slug: "backend-engineer-berlin-clera-9fa390e2f70e",
        url: "https://eurojobs.ai/jobs/companies/clera/backend-engineer-berlin-clera-9fa390e2f70e",
        apply_url: "https://eurojobs.ai/apply/18842?from=api",
        title: "Backend Engineer",
        company_name: "Clera",
        location: "Berlin, Germany",
        city: "Berlin",
        countries: ["DE"],
        country: "DE",
        work_mode: "onsite",
        remote: false,
        role_family: "backend",
        skills: ["typescript", "node"],
        seniority: "senior",
        employment_type: "full_time",
        salary: { min: 80000, max: 120000, currency: "EUR", period: "year" },
        openings: 1,
        posted_at: "2026-11-18T17:21:23.486Z",
        description_snippet: "About the Role",
      }),
    ).toEqual({
      source: "eurojobs",
      sourceJobId: "18842",
      title: "Backend Engineer",
      employer: "Clera",
      jobUrl:
        "https://eurojobs.ai/jobs/companies/clera/backend-engineer-berlin-clera-9fa390e2f70e",
      applicationLink:
        "https://eurojobs.ai/jobs/companies/clera/backend-engineer-berlin-clera-9fa390e2f70e",
      location: "Berlin, Germany",
      locationEvidence: {
        location: "Berlin, Germany",
        city: "Berlin",
        country: "Germany",
        regionHints: undefined,
        workplaceType: "onsite",
        isRemote: false,
        isHybrid: false,
        source: "eurojobs",
      },
      jobDescription: "About the Role",
      datePosted: "2026-11-18T17:21:23.486Z",
      salary: "EUR 80,000–120,000/year",
      salaryInterval: "year",
      salaryMinAmount: 80000,
      salaryMaxAmount: 120000,
      salaryCurrency: "EUR",
      jobType: "full_time",
      isRemote: false,
      jobLevel: "senior",
      jobFunction: "backend",
      skills: "typescript, node",
      vacancyCount: 1,
      workFromHomeType: "onsite",
    });
  });

  it("keeps multi-country remote jobs without a single country", () => {
    const job = mapEuroJobsJob(
      row(1, {
        location: "Remote · Sweden, Germany, UK",
        countries: ["SE", "DE", "GB"],
        country: "SE",
        work_mode: "remote",
        remote: true,
        salary: null,
      }),
    );

    expect(job?.isRemote).toBe(true);
    expect(job?.salary).toBeUndefined();
    expect(job?.locationEvidence).toEqual(
      expect.objectContaining({
        country: undefined,
        regionHints: ["Sweden", "Germany", "United Kingdom"],
        workplaceType: "remote",
        isRemote: true,
      }),
    );
  });

  it("rejects rows without a title, company, or job page URL", () => {
    expect(mapEuroJobsJob(row(1, { title: "" }))).toBeNull();
    expect(mapEuroJobsJob(row(1, { company_name: undefined }))).toBeNull();
    expect(mapEuroJobsJob(row(1, { url: "javascript:alert(1)" }))).toBeNull();
    expect(mapEuroJobsJob(null)).toBeNull();
  });

  it("converts description HTML into readable text", () => {
    expect(
      euroJobsHtmlToText(
        "<h3>About</h3><p>Build &amp; ship.</p><ul><li>Go</li><li>Rust&#39;s tooling</li></ul>",
      ),
    ).toBe("About\n\nBuild & ship.\n\n- Go\n- Rust's tooling");
  });

  it("paginates within the result limit and fetches full descriptions", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => row(index + 1));
    const secondPage = Array.from({ length: 100 }, (_, index) =>
      row(index + 101),
    );
    const fetchMock = vi.fn(async (input: unknown) => {
      if (isDetailCall(input)) {
        return jsonResponse({ data: { description_html: "<p>Full text</p>" } });
      }
      const page = new URL(String(input)).searchParams.get("page");
      return listResponse(page === "1" ? firstPage : secondPage, 1000);
    });

    const result = await runEuroJobs({
      searchTerms: ["software engineer"],
      maxJobsPerTerm: 150,
      existingJobUrls: [firstPage[0].url],
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(150);
    const listCalls = fetchMock.mock.calls.filter(
      ([input]) => !isDetailCall(input),
    );
    expect(listCalls).toHaveLength(2);
    // Known jobs keep their snippet and are not fetched again.
    expect(
      fetchMock.mock.calls.filter(([input]) => isDetailCall(input)),
    ).toHaveLength(149);
    expect(result.jobs[0].jobDescription).toBe("Short snippet");
    expect(result.jobs[1].jobDescription).toBe("Full text");
  });

  it("stops at the last page and never exceeds the page cap", async () => {
    const fullPage = (offset: number) =>
      Array.from({ length: 100 }, (_, index) => row(offset + index + 1));
    let call = 0;
    const fetchMock = vi.fn(async () =>
      listResponse(fullPage(call++ * 100), 10_000),
    );

    const result = await runEuroJobs({
      searchTerms: ["software engineer"],
      maxJobsPerTerm: 5000,
      fetchDescriptions: false,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(result.jobs).toHaveLength(500);

    const shortFetch = vi.fn(async () => listResponse([row(1), row(2)], 2));
    await runEuroJobs({
      searchTerms: ["software engineer"],
      maxJobsPerTerm: 500,
      fetchDescriptions: false,
      fetchImpl: shortFetch as unknown as typeof fetch,
    });
    expect(shortFetch).toHaveBeenCalledTimes(1);
  });

  it("splits the limit across cities and skips country names", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      const city = new URL(String(input)).searchParams.get("location");
      return listResponse([
        row(city === "berlin" ? 1 : 2),
        row(city === "berlin" ? 3 : 4),
      ]);
    });

    const result = await runEuroJobs({
      searchTerms: ["software engineer"],
      selectedCountry: "germany",
      locations: ["Berlin", "Germany", "Munich"],
      maxJobsPerTerm: 2,
      fetchDescriptions: false,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const cities = fetchMock.mock.calls.map(([input]) =>
      new URL(String(input)).searchParams.get("location"),
    );
    expect(cities).toEqual(["berlin", "munich"]);
    expect(result.jobs.map((job) => job.sourceJobId)).toEqual(["1", "2"]);
  });

  it("filters hybrid and onsite locally and de-duplicates across terms", async () => {
    const fetchMock = vi.fn(async () =>
      listResponse([
        row(1, { work_mode: "remote" }),
        row(2, { work_mode: "hybrid" }),
        row(3, { work_mode: "onsite" }),
      ]),
    );

    const result = await runEuroJobs({
      searchTerms: ["software", "engineer"],
      workplaceTypes: ["remote", "hybrid"],
      fetchDescriptions: false,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.jobs.map((job) => job.sourceJobId)).toEqual(["1", "2"]);
  });

  it("keeps the snippet when a description request fails", async () => {
    const fetchMock = vi.fn(async (input: unknown) =>
      isDetailCall(input) ? jsonResponse({}, 500) : listResponse([row(1)]),
    );

    const result = await runEuroJobs({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.success).toBe(true);
    expect(result.jobs[0].jobDescription).toBe("Short snippet");
  });

  it("returns a status-only error for failed search requests", async () => {
    const result = await runEuroJobs({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({}, 503)),
    });

    expect(result).toEqual({
      success: false,
      jobs: [],
      error: "EuroJobs request failed with status 503",
    });
  });
});
