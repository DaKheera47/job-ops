import { describe, expect, it } from "vitest";
import { extractUpworkSalary, parseUpworkRss, stripHtml } from "../src/parser";

describe("parseUpworkRss", () => {
  it("maps valid RSS entries into CreateJobInput values", () => {
    const jobs = parseUpworkRss(`
      <rss>
        <channel>
          <item>
            <title>Build a TypeScript scraper</title>
            <link>https://www.upwork.com/jobs/~0123456789abcdef</link>
            <guid>0123456789abcdef</guid>
            <pubDate>Wed, 13 May 2026 12:00:00 +0000</pubDate>
            <description><![CDATA[
              <p>Budget: $500 Posted On: May 13</p>
              <p>Need a strict TypeScript scraper.</p>
            ]]></description>
          </item>
        </channel>
      </rss>
    `);

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
        jobType: "Freelance / Contract",
        isRemote: true,
      }),
    );
    expect(jobs[0]?.jobDescription).toContain(
      "Need a strict TypeScript scraper.",
    );
  });

  it("skips malformed entries silently", () => {
    const jobs = parseUpworkRss(`
      <rss>
        <channel>
          <item><title>Missing link</title></item>
          <item>
            <title>Valid job</title>
            <link>https://www.upwork.com/jobs/~valid</link>
          </item>
        </channel>
      </rss>
    `);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Valid job");
  });

  it("strips basic HTML and decodes common entities", () => {
    expect(stripHtml("<p>Hello&nbsp;&amp;&nbsp;welcome<br>friend</p>")).toBe(
      "Hello & welcome friend",
    );
  });

  it("extracts budget and hourly salary text", () => {
    expect(extractUpworkSalary("Budget: $1,200 Posted On: today")).toBe(
      "$1,200",
    );
    expect(
      extractUpworkSalary("Hourly Range: $20.00-$40.00 Category: Dev"),
    ).toBe("$20.00-$40.00");
  });
});
