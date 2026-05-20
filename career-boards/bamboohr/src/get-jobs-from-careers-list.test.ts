import { describe, expect, it } from "vitest";
import { parseBamboohrUrl } from "./bamboohr-url";
import {
  getJobsFromCareersList,
  normalizeBamboohrListJob,
} from "./get-jobs-from-careers-list";

describe("normalizeBamboohrListJob", () => {
  const source = parseBamboohrUrl(
    "https://ashteadtechnology.bamboohr.com/careers",
  );

  it("maps BambooHR list rows into normalized jobs", () => {
    expect(
      normalizeBamboohrListJob(
        {
          id: "335",
          jobOpeningName: "Logistics and Export Compliance Coordinator",
          employmentStatusLabel: "Full-Time",
          location: { city: "Houston", state: "Texas" },
        },
        source,
      ),
    ).toMatchObject({
      source: "bamboohr",
      externalId: "335",
      title: "Logistics and Export Compliance Coordinator",
      employmentStatus: "Full-Time",
      jobUrl: "https://ashteadtechnology.bamboohr.com/careers/335",
      locationText: "Houston, Texas",
    });
  });

  it("uses atsLocation data when the main location is sparse", async () => {
    const result = await getJobsFromCareersList({
      careersUrl: "https://ashteadtechnology.bamboohr.com/careers",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            meta: { totalCount: 1 },
            result: [
              {
                id: "35",
                jobOpeningName: "Offshore Survey Engineer",
                atsLocation: { country: "United Kingdom" },
                locationType: "1",
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
    });

    expect(result).toMatchObject({
      total: 1,
      fetched: 1,
      jobs: [
        expect.objectContaining({
          externalId: "35",
          locationText: "United Kingdom",
        }),
      ],
    });
  });
});
