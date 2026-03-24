import { describe, expect, it, vi } from "vitest";
import { runWorkingNomads } from "../src/run";

function createResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as Response;
}

describe("runWorkingNomads", () => {
  it("filters jobs by search term and infers contract job types", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse([
        {
          url: "https://www.workingnomads.com/job/go/123/",
          title: "Senior Backend Engineer",
          description: "<p>Contract role building APIs.</p>",
          company_name: "Acme",
          category_name: "Development",
          tags: "nodejs,backend",
          location: "Europe",
          pub_date: "2026-03-20T10:00:00-04:00",
        },
        {
          url: "https://www.workingnomads.com/job/go/124/",
          title: "Account Executive",
          description: "<p>Sales role.</p>",
          company_name: "Beta",
          category_name: "Sales",
          tags: "sales",
          location: "United States",
          pub_date: "2026-03-20T10:00:00-04:00",
        },
      ]),
    );

    const result = await runWorkingNomads({
      searchTerms: ["backend engineer"],
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        source: "workingnomads",
        sourceJobId: "123",
        title: "Senior Backend Engineer",
        employer: "Acme",
        jobType: "Contract",
        jobFunction: "Development",
        isRemote: true,
      }),
    );
  });

  it("applies location filters using explicit cities before country fallback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createResponse([
        {
          url: "https://www.workingnomads.com/job/go/123/",
          title: "Backend Engineer",
          description: "<p>Full-time role.</p>",
          company_name: "Acme",
          category_name: "Development",
          tags: "nodejs",
          location: "Berlin, Germany",
          pub_date: "2026-03-20T10:00:00-04:00",
        },
        {
          url: "https://www.workingnomads.com/job/go/124/",
          title: "Backend Engineer",
          description: "<p>Full-time role.</p>",
          company_name: "Beta",
          category_name: "Development",
          tags: "python",
          location: "Paris, France",
          pub_date: "2026-03-20T10:00:00-04:00",
        },
      ]),
    );

    const result = await runWorkingNomads({
      searchTerms: ["backend"],
      selectedCountry: "germany",
      locations: ["Berlin"],
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]?.employer).toBe("Acme");
  });

  it("returns no jobs when remote is not an allowed workplace type", async () => {
    const fetchMock = vi.fn();

    const result = await runWorkingNomads({
      searchTerms: ["backend"],
      workplaceTypes: ["onsite"],
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
