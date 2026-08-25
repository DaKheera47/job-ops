import { describe, expect, it, vi } from "vitest";
import {
  buildFreeHireSearchUrl,
  fetchFreeHirePage,
  mapFreeHireJob,
  runFreeHire,
} from "../src/run";

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response;
}

describe("FreeHire extractor", () => {
  it("builds a filtered public agent search URL", () => {
    const url = buildFreeHireSearchUrl({
      searchTerm: "backend engineer",
      selectedCountry: "uk",
      locations: ["London"],
      workplaceTypes: ["remote", "hybrid"],
      limit: 250,
    });

    expect(url.pathname).toBe("/api/v1/agent/jobs/search");
    expect(url.searchParams.get("q")).toBe("backend engineer");
    expect(url.searchParams.get("countries")).toBe("GB");
    expect(url.searchParams.get("cities")).toBe("London");
    expect(url.searchParams.get("work_mode")).toBe("remote,hybrid");
    expect(url.searchParams.get("description_format")).toBe("markdown");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("offset")).toBe("0");
  });

  it("maps FreeHire fields into a normalized job", () => {
    expect(
      mapFreeHireJob({
        public_slug: "senior-go-engineer-acme-1a2b",
        external_id: "123",
        url: "https://boards.greenhouse.io/acme/jobs/123",
        title: "Senior Go Engineer",
        company: "Acme",
        location: "Remote — EU",
        description: "## About the role",
        posted_at: "2026-06-18T00:00:00Z",
        work_mode: "remote",
        skills: ["go", "postgresql"],
        enrichment: {
          seniority: "senior",
          category: "backend",
          employment_type: "full_time",
          experience_years_min: 5,
          domains: ["fintech"],
          company_size: "51-200",
          salary_min: 90000,
          salary_max: 130000,
          salary_currency: "EUR",
          salary_period: "year",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        source: "freehire",
        sourceJobId: "senior-go-engineer-acme-1a2b",
        title: "Senior Go Engineer",
        employer: "Acme",
        jobUrl: "https://boards.greenhouse.io/acme/jobs/123",
        applicationLink: "https://boards.greenhouse.io/acme/jobs/123",
        jobDescription: "## About the role",
        datePosted: "2026-06-18T00:00:00Z",
        salary: "EUR 90,000–130,000/year",
        salaryMinAmount: 90000,
        salaryMaxAmount: 130000,
        salaryCurrency: "EUR",
        jobType: "full_time",
        isRemote: true,
        jobLevel: "senior",
        jobFunction: "backend",
        skills: "go, postgresql",
        companyIndustry: "fintech",
        companyNumEmployees: "51-200",
        experienceRange: "5+ years",
      }),
    );
  });

  it("fetches once per term and de-duplicates upstream URLs", async () => {
    const row = {
      public_slug: "job-1",
      url: "https://example.com/jobs/1",
      title: "Software Engineer",
      company: "Acme",
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ data: [row] }))
      .mockResolvedValueOnce(jsonResponse({ data: [row] }));

    const result = await runFreeHire({
      searchTerms: ["software", "engineer"],
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ success: true, jobs: [expect.any(Object)] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns upstream pagination for live consumers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            public_slug: "job-1",
            url: "https://example.com/jobs/1",
            title: "Software Engineer",
            company: "Acme",
          },
        ],
        meta: { limit: 20, offset: 40, total: 1234 },
      }),
    );

    const result = await fetchFreeHirePage({
      searchTerm: "software engineer",
      limit: 20,
      offset: 40,
      timeoutMs: 5_000,
      fetchImpl: fetchMock,
    });

    expect(result).toMatchObject({ limit: 20, offset: 40, total: 1234 });
    expect(result.jobs).toHaveLength(1);
    const requestedUrl = fetchMock.mock.calls[0][0] as URL;
    expect(requestedUrl.searchParams.get("offset")).toBe("40");
  });

  it("returns a status-only error for failed upstream requests", async () => {
    const result = await runFreeHire({
      fetchImpl: vi.fn().mockResolvedValue(jsonResponse({}, 503)),
    });

    expect(result).toEqual({
      success: false,
      jobs: [],
      error: "FreeHire request failed with status 503",
    });
  });
});
