import { describe, expect, it } from "vitest";
import {
  formatLocation,
  getJobsFromBoard,
  normalizeGreenhouseListJob,
} from "./get-jobs-from-board";
import { parseGreenhouseUrl } from "./greenhouse-url";

const source = parseGreenhouseUrl("https://job-boards.greenhouse.io/epicgames");

describe("normalizeGreenhouseListJob", () => {
  it("maps a Greenhouse list row into a normalized job", () => {
    expect(
      normalizeGreenhouseListJob(
        {
          id: 6103058004,
          title: "Animation Systems Programmer",
          absolute_url:
            "https://epicgames.com/careers/jobs/6103058004?gh_jid=6103058004",
          location: { name: "Larkspur,California,United States" },
          first_published: "2026-06-01T00:00:00-04:00",
          company_name: "Epic Games",
        },
        source,
      ),
    ).toMatchObject({
      source: "greenhouse",
      externalId: "6103058004",
      title: "Animation Systems Programmer",
      jobUrl: "https://epicgames.com/careers/jobs/6103058004?gh_jid=6103058004",
      jobApiUrl:
        "https://boards-api.greenhouse.io/v1/boards/epicgames/jobs/6103058004",
      locationText: "Larkspur, California, United States",
      postedOn: "2026-06-01T00:00:00-04:00",
      company: "Epic Games",
    });
  });

  it("throws when a required field is missing", () => {
    expect(() => normalizeGreenhouseListJob({ id: 1 }, source)).toThrow(
      /missing required field title/,
    );
  });
});

describe("formatLocation", () => {
  it("adds spacing after commas", () => {
    expect(formatLocation("A,B,C")).toBe("A, B, C");
  });
  it("returns undefined for empty values", () => {
    expect(formatLocation("  ")).toBeUndefined();
    expect(formatLocation(null)).toBeUndefined();
  });
  it("drops Greenhouse 'BLANK' placeholder components", () => {
    expect(formatLocation("BLANK,BLANK,Multiple Locations")).toBe(
      "Multiple Locations",
    );
    expect(formatLocation("Cary,BLANK,United States")).toBe(
      "Cary, United States",
    );
  });
  it("returns undefined when every component is a placeholder", () => {
    expect(formatLocation("BLANK,BLANK")).toBeUndefined();
  });
});

describe("getJobsFromBoard", () => {
  it("fetches and normalizes the board job list", async () => {
    const result = await getJobsFromBoard({
      careersUrl: "https://job-boards.greenhouse.io/epicgames",
      fetchImpl: async (url) => {
        expect(String(url)).toBe(
          "https://boards-api.greenhouse.io/v1/boards/epicgames/jobs",
        );
        return new Response(
          JSON.stringify({
            meta: { total: 2 },
            jobs: [
              {
                id: 1,
                title: "Engineer",
                absolute_url: "https://epicgames.com/careers/jobs/1",
                location: { name: "Cary,North Carolina" },
              },
              {
                id: 2,
                title: "Designer",
                absolute_url: "https://epicgames.com/careers/jobs/2",
                location: { name: "Remote" },
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    expect(result.total).toBe(2);
    expect(result.fetched).toBe(2);
    expect(result.jobs.map((job) => job.title)).toEqual([
      "Engineer",
      "Designer",
    ]);
  });

  it("throws on a non-200 response", async () => {
    await expect(
      getJobsFromBoard({
        careersUrl: "https://job-boards.greenhouse.io/nope",
        fetchImpl: async () => new Response("nope", { status: 404 }),
      }),
    ).rejects.toThrow(/HTTP 404/);
  });
});
