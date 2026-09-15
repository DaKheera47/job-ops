import { describe, expect, it } from "vitest";
import {
  extractUpworkSalary,
  parseUpworkItems,
  stripHtml,
} from "../src/parser";

describe("parseUpworkItems", () => {
  it("maps valid Apify entries into CreateJobInput values", () => {
    const jobs = parseUpworkItems([
      {
        id: "0123456789abcdef",
        title: "Build a TypeScript scraper",
        url: "https://www.upwork.com/jobs/~0123456789abcdef",
        absoluteDate: "2026-05-13T12:00:00.000Z",
        description:
          "<p>Need a strict TypeScript scraper &amp; Apify workflow.</p>",
        budget: { amount: 500, currency: "USD" },
        jobType: "fixed",
        clientLocation: "United States",
        tags: ["TypeScript", "Apify"],
        experienceLevel: "Intermediate",
      },
    ]);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(
      expect.objectContaining({
        source: "upwork",
        sourceJobId: "0123456789abcdef",
        title: "Build a TypeScript scraper",
        employer: "Upwork Client",
        jobUrl: "https://www.upwork.com/jobs/~0123456789abcdef",
        applicationLink: "https://www.upwork.com/jobs/~0123456789abcdef",
        salary: "$500",
        location: "United States",
        jobType: "Fixed Price",
        skills: "TypeScript, Apify",
        experienceRange: "Intermediate",
        isRemote: true,
      }),
    );
    expect(jobs[0]?.jobDescription).toBe(
      "Need a strict TypeScript scraper & Apify workflow.",
    );
  });

  it("normalizes relative Upwork URLs", () => {
    const jobs = parseUpworkItems([
      {
        jobId: "relative",
        title: "Relative URL job",
        url: "/jobs/~relative",
      },
    ]);

    expect(jobs[0]?.jobUrl).toBe("https://www.upwork.com/jobs/~relative");
  });

  it("skips malformed entries silently", () => {
    const jobs = parseUpworkItems([
      { title: "Missing URL" },
      { url: "https://www.upwork.com/jobs/~missing-title" },
      {
        title: "Valid job",
        url: "https://www.upwork.com/jobs/~valid",
      },
    ]);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Valid job");
  });

  it("strips basic HTML and decodes common entities", () => {
    expect(stripHtml("<p>Hello&nbsp;&amp;&nbsp;welcome<br>friend</p>")).toBe(
      "Hello & welcome friend",
    );
  });

  it("extracts fixed and hourly salary text", () => {
    expect(
      extractUpworkSalary({
        budgetMin: 500,
        budgetMax: 1000,
        currency: "USD",
      }),
    ).toBe("$500-$1,000");

    expect(
      extractUpworkSalary({
        hourlyRange: { min: 20, max: 40, currency: "USD" },
      }),
    ).toBe("$20-$40/hr");
  });
});
