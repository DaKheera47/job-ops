import { describe, expect, it, vi } from "vitest";
import { runGolangJobs } from "../src/run";

function createResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

describe("runGolangJobs", () => {
  const supabaseAnonKey = "test-supabase-key";

  it("filters jobs by search term and maps core fields", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse([
          {
            id: "job-1",
            title: "Senior Backend Engineer",
            company: "Acme",
            type: "full-time",
            application_url: "https://example.com/apply",
            slug: "golang-jobs-at-acme-job-1",
            posted_at: "2026-03-14T14:55:59.542277+00:00",
            description: "<p>Build Go APIs.</p>",
            requirements: ["Go", "Postgres"],
            cities: {
              name: "Remote",
              country: "Ireland",
            },
          },
          {
            id: "job-2",
            title: "Product Designer",
            company: "Beta",
            type: "full-time",
            application_url: "https://example.com/design",
            slug: "golang-jobs-at-beta-job-2",
            posted_at: "2026-03-14T14:55:59.542277+00:00",
            description: "<p>Design systems.</p>",
            requirements: [],
            cities: {
              name: "Remote",
              country: "Germany",
            },
          },
        ]),
      )
      .mockResolvedValueOnce(createResponse([]));

    const result = await runGolangJobs({
      searchTerms: ["backend engineer"],
      supabaseAnonKey,
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        source: "golangjobs",
        sourceJobId: "job-1",
        title: "Senior Backend Engineer",
        employer: "Acme",
        jobType: "Full-time",
        location: "Remote (Ireland)",
        isRemote: true,
        skills: "Go, Postgres",
      }),
    );
  });

  it("applies explicit city filters before country fallback", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse([
          {
            id: "job-1",
            title: "Go Engineer",
            company: "Acme",
            type: "full-time",
            application_url: "https://example.com/apply",
            slug: "golang-jobs-at-acme-job-1",
            posted_at: "2026-03-14T14:55:59.542277+00:00",
            description: "<p>Build services.</p>",
            requirements: [],
            cities: {
              name: "Berlin",
              country: "Germany",
            },
          },
          {
            id: "job-2",
            title: "Go Engineer",
            company: "Beta",
            type: "full-time",
            application_url: "https://example.com/apply-2",
            slug: "golang-jobs-at-beta-job-2",
            posted_at: "2026-03-14T14:55:59.542277+00:00",
            description: "<p>Build services.</p>",
            requirements: [],
            cities: {
              name: "Munich",
              country: "Germany",
            },
          },
        ]),
      )
      .mockResolvedValueOnce(createResponse([]));

    const result = await runGolangJobs({
      searchTerms: ["go engineer"],
      selectedCountry: "germany",
      locations: ["Berlin"],
      supabaseAnonKey,
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.employer).toBe("Acme");
  });

  it("filters by selected country including usa/ca", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse([
          {
            id: "job-us",
            title: "Go Engineer",
            company: "Acme",
            type: "full-time",
            application_url: "https://example.com/us",
            slug: "golang-jobs-at-acme-us",
            posted_at: "2026-03-14T14:55:59.542277+00:00",
            description: "<p>US role.</p>",
            requirements: [],
            cities: {
              name: "Remote",
              country: "United States",
            },
          },
          {
            id: "job-de",
            title: "Go Engineer",
            company: "Beta",
            type: "full-time",
            application_url: "https://example.com/de",
            slug: "golang-jobs-at-beta-de",
            posted_at: "2026-03-14T14:55:59.542277+00:00",
            description: "<p>German role.</p>",
            requirements: [],
            cities: {
              name: "Remote",
              country: "Germany",
            },
          },
        ]),
      )
      .mockResolvedValueOnce(createResponse([]));

    const result = await runGolangJobs({
      searchTerms: ["go engineer"],
      selectedCountry: "usa/ca",
      supabaseAnonKey,
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.sourceJobId).toBe("job-us");
  });

  it("returns no jobs when remote is not an allowed workplace type", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse([
          {
            id: "job-1",
            title: "Go Engineer",
            company: "Acme",
            type: "full-time",
            application_url: "https://example.com/apply",
            slug: "golang-jobs-at-acme-job-1",
            posted_at: "2026-03-14T14:55:59.542277+00:00",
            description: "<p>Remote role.</p>",
            requirements: [],
            cities: {
              name: "Remote",
              country: "Ireland",
            },
          },
        ]),
      )
      .mockResolvedValueOnce(createResponse([]));

    const result = await runGolangJobs({
      searchTerms: ["go engineer"],
      workplaceTypes: ["onsite"],
      supabaseAnonKey,
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toEqual([]);
  });

  it("stops scanning a term once the per-term cap is reached", async () => {
    const overflowingJob = {
      id: "job-2",
      company: "Beta",
      type: "full-time",
      application_url: "https://example.com/apply-2",
      slug: "golang-jobs-at-beta-job-2",
      posted_at: "2026-03-14T14:55:59.542277+00:00",
      description: "<p>Remote role.</p>",
      requirements: [],
      cities: {
        name: "Remote",
        country: "Ireland",
      },
    };
    Object.defineProperty(overflowingJob, "title", {
      get() {
        throw new Error("loop should stop before inspecting overflow jobs");
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse([
          {
            id: "job-1",
            title: "Go Engineer",
            company: "Acme",
            type: "full-time",
            application_url: "https://example.com/apply",
            slug: "golang-jobs-at-acme-job-1",
            posted_at: "2026-03-14T14:55:59.542277+00:00",
            description: "<p>Remote role.</p>",
            requirements: [],
            cities: {
              name: "Remote",
              country: "Ireland",
            },
          },
          overflowingJob,
        ]),
      )
      .mockResolvedValueOnce(createResponse([]));

    const result = await runGolangJobs({
      searchTerms: ["go engineer"],
      maxJobsPerTerm: 1,
      supabaseAnonKey,
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
  });

  it("uses the built-in Supabase anon key when no override is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(createResponse([]));

    const result = await runGolangJobs({
      searchTerms: ["go engineer"],
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({
      success: true,
      jobs: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stops pagination when cancellation is requested before the next page", async () => {
    let cancelled = false;
    const fetchMock = vi.fn().mockImplementationOnce(async () => {
      cancelled = true;
      return createResponse(
        Array.from({ length: 200 }, (_, index) => ({
          id: `job-${index + 1}`,
          title: "Go Engineer",
          company: "Acme",
          type: "full-time",
          application_url: `https://example.com/apply-${index + 1}`,
          slug: `golang-jobs-at-acme-job-${index + 1}`,
          posted_at: "2026-03-14T14:55:59.542277+00:00",
          description: "<p>Remote role.</p>",
          requirements: [],
          cities: {
            name: "Remote",
            country: "Ireland",
          },
        })),
      );
    });

    const result = await runGolangJobs({
      searchTerms: ["go engineer"],
      supabaseAnonKey,
      fetchImpl: fetchMock,
      shouldCancel: () => cancelled,
    });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
