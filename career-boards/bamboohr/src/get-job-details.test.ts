import { describe, expect, it } from "vitest";
import { getJobDetails } from "./get-job-details";

describe("getJobDetails", () => {
  it("normalizes BambooHR detail payloads", async () => {
    const result = await getJobDetails({
      jobUrl: "https://ashteadtechnology.bamboohr.com/careers/134",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            meta: {},
            result: {
              jobOpening: {
                jobOpeningShareUrl:
                  "https://ashteadtechnology.bamboohr.com/careers/134",
                jobOpeningName: "Onshore Electrical Technician",
                employmentStatusLabel: "Full-Time",
                location: {
                  city: "Thainstone",
                  state: "Aberdeenshire",
                  addressCountry: "United Kingdom",
                },
                description:
                  "<p><strong>What you'll be doing:</strong></p><ul><li>Testing</li></ul>",
                datePosted: "2025-03-20",
                minimumExperience: "Experienced",
              },
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    expect(result.job).toMatchObject({
      source: "bamboohr",
      externalId: "134",
      title: "Onshore Electrical Technician",
      jobUrl: "https://ashteadtechnology.bamboohr.com/careers/134",
      locationText: "Thainstone, Aberdeenshire, United Kingdom",
      postedOn: "2025-03-20",
      employmentStatus: "Full-Time",
      minimumExperience: "Experienced",
      jobDescriptionHtml:
        "<p><strong>What you'll be doing:</strong></p><ul><li>Testing</li></ul>",
    });
    expect(result.job.jobDescriptionText).toContain("What you'll be doing:");
    expect(result.job.jobDescriptionText).toContain("Testing");
  });
});
