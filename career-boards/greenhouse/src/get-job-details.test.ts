import { describe, expect, it } from "vitest";
import {
  decodeHtmlEntities,
  getJobDetails,
  normalizeGreenhouseJobDetails,
} from "./get-job-details";

describe("decodeHtmlEntities", () => {
  it("decodes entity-encoded HTML in a single pass", () => {
    expect(decodeHtmlEntities("&lt;p&gt;Hi&lt;/p&gt;")).toBe("<p>Hi</p>");
  });

  it("decodes numeric and hex entities", () => {
    expect(decodeHtmlEntities("A&#38;B &#x2019;")).toBe("A&B ’");
  });

  it("preserves double-encoded inner entities as valid HTML", () => {
    // Greenhouse stores `<p>A &amp; B</p>` as `&lt;p&gt;A &amp;amp; B&lt;/p&gt;`.
    expect(decodeHtmlEntities("&lt;p&gt;A &amp;amp; B&lt;/p&gt;")).toBe(
      "<p>A &amp; B</p>",
    );
  });

  it("leaves unknown entities untouched", () => {
    expect(decodeHtmlEntities("&notreal;")).toBe("&notreal;");
  });
});

describe("normalizeGreenhouseJobDetails", () => {
  const ref = {
    token: "epicgames",
    jobId: "6103058004",
    detailUrl:
      "https://boards-api.greenhouse.io/v1/boards/epicgames/jobs/6103058004",
  };

  it("normalizes a detail response with decoded description", () => {
    const details = normalizeGreenhouseJobDetails(
      {
        id: 6103058004,
        title: "Animation Systems Programmer",
        absolute_url: "https://epicgames.com/careers/jobs/6103058004",
        location: { name: "Larkspur,California" },
        content: "&lt;p&gt;Build &amp;amp; ship things.&lt;/p&gt;",
        company_name: "Epic Games",
        departments: [{ name: "Engineering" }],
        first_published: "2026-06-01T00:00:00-04:00",
      },
      ref,
    );

    expect(details).toMatchObject({
      source: "greenhouse",
      externalId: "6103058004",
      title: "Animation Systems Programmer",
      jobUrl: "https://epicgames.com/careers/jobs/6103058004",
      locationText: "Larkspur, California",
      company: "Epic Games",
      department: "Engineering",
      jobDescriptionHtml: "<p>Build &amp; ship things.</p>",
    });
    expect(details.jobDescriptionText).toBe("Build & ship things.");
  });

  it("throws when content is missing", () => {
    expect(() => normalizeGreenhouseJobDetails({ title: "X" }, ref)).toThrow(
      /missing required field content/,
    );
  });
});

describe("getJobDetails", () => {
  it("fetches from the board API job detail endpoint", async () => {
    const details = await getJobDetails({
      jobRef:
        "https://boards-api.greenhouse.io/v1/boards/epicgames/jobs/6103058004",
      fetchImpl: async (url) => {
        expect(String(url)).toBe(
          "https://boards-api.greenhouse.io/v1/boards/epicgames/jobs/6103058004",
        );
        return new Response(
          JSON.stringify({
            id: 6103058004,
            title: "Engineer",
            content: "&lt;p&gt;Role&lt;/p&gt;",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    expect(details.job.title).toBe("Engineer");
    expect(details.job.jobDescriptionHtml).toBe("<p>Role</p>");
  });
});
