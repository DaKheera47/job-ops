import { describe, expect, it } from "vitest";
import { parseWazzufJobs } from "../src/parser";

describe("parseWazzufJobs", () => {
  it("maps WUZZUF search result cards into CreateJobInput values", () => {
    const jobs = parseWazzufJobs(`
      <article class="job-card">
        <h2><a href="/jobs/p/abc123-Backend-Engineer-Cairo-Egypt">Backend Engineer</a></h2>
        <a class="company-name" href="/jobs/careers/acme">Acme -</a>
        <span class="job-location">Cairo, Egypt</span>
        <time datetime="2026-05-13T10:00:00.000Z">1 hour ago</time>
        <span class="salary">Confidential</span>
        <p class="job-description">Build APIs for remote teams.</p>
        <span>Full Time</span>
        <a href="/jobs/skills/node">Node.js</a>
      </article>
    `);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toEqual(
      expect.objectContaining({
        source: "wazzuf",
        sourceJobId: "abc123-Backend-Engineer-Cairo-Egypt",
        title: "Backend Engineer",
        employer: "Acme",
        jobUrl: "https://wuzzuf.net/jobs/p/abc123-Backend-Engineer-Cairo-Egypt",
        location: "Cairo, Egypt",
        datePosted: "2026-05-13T10:00:00.000Z",
        salary: "Confidential",
        jobDescription: "Build APIs for remote teams.",
        jobType: "Full-time",
        isRemote: true,
      }),
    );
    expect(jobs[0]?.skills).toContain("Node.js");
  });

  it("normalizes absolute URLs and falls back when optional fields are missing", () => {
    const jobs = parseWazzufJobs(`
      <div class="css-1gatmva">
        <a href="https://wuzzuf.net/jobs/p/xyz-Frontend-Engineer">Frontend Engineer</a>
      </div>
    `);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.employer).toBe("Unknown Employer");
    expect(jobs[0]?.jobUrl).toBe(
      "https://wuzzuf.net/jobs/p/xyz-Frontend-Engineer",
    );
  });

  it("skips malformed cards silently", () => {
    const jobs = parseWazzufJobs(`
      <article><a href="/companies/acme">Acme</a></article>
      <article><a href="/jobs/p/valid-job">Valid Job</a></article>
    `);

    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.title).toBe("Valid Job");
  });
});
