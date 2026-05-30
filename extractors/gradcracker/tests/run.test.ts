import { describe, expect, it, vi } from "vitest";
import {
  decodeGradcrackerOutUrl,
  parseGradcrackerDetailPage,
  parseGradcrackerListPage,
  runHttpCrawler,
} from "../src/run";

function createResponse(
  payload: string,
  init: Partial<Response> = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    url: init.url ?? "",
    headers: init.headers ?? new Headers(),
    text: async () => payload,
  } as Response;
}

const LIST_HTML = `
  <article wire:key="job-81268">
    <figure>
      <a href="/hub/408/wsp">
        <img alt="WSP" />
      </a>
    </figure>
    <h2>
      <a href="/hub/408/wsp/graduate-job/81268/graduate-professional-rail-modelling-and-simulation-analyst">
        Graduate/Professional Rail Modelling and Simulation Analyst
      </a>
    </h2>
    <h3>Mechanical, Maths, Computer Science, Software, Analytics.</h3>
    <div>Deadline: Ongoing</div>
    <dl>
      <div><dt>Salary</dt><dd>Competitive</dd></div>
      <div><dt>Location</dt><dd>London</dd></div>
      <div><dt>Degree required</dt><dd>Bachelor's</dd></div>
      <div><dt>Starting</dt><dd>September 2026</dd></div>
    </dl>
  </article>
`;

const DETAIL_HTML = `
  <main>
    <div class="body-content">
      <p>Build transport modelling tools.</p>
      <p>Work with Python, data, and simulation platforms.</p>
    </div>
    <a href="/out/408?jobID=81268&u=https%253A%252F%252Fexample.com%252Fapply%253Fjob%253D81268&signature=abc">
      Apply online now
    </a>
  </main>
`;

describe("Gradcracker HTTP scraper", () => {
  it("parses list cards with the fields used by the pipeline", () => {
    const [job] = parseGradcrackerListPage(
      LIST_HTML,
      "https://www.gradcracker.com/search/computing-technology/software-systems-graduate-jobs-in-london-and-south-east?order=dateAdded",
      "software-systems",
    );

    expect(job).toEqual({
      title: "Graduate/Professional Rail Modelling and Simulation Analyst",
      jobUrl:
        "https://www.gradcracker.com/hub/408/wsp/graduate-job/81268/graduate-professional-rail-modelling-and-simulation-analyst",
      employer: "WSP",
      employerUrl: "https://www.gradcracker.com/hub/408/wsp",
      disciplines: "Mechanical, Maths, Computer Science, Software, Analytics.",
      deadline: "Ongoing",
      salary: "Competitive",
      location: "London",
      degreeRequired: "Bachelor's",
      starting: "September 2026",
      role: "software-systems",
    });
  });

  it("decodes Gradcracker out links without opening a browser", () => {
    expect(
      decodeGradcrackerOutUrl(
        "https://www.gradcracker.com/out/408?jobID=81268&u=https%253A%252F%252Fexample.com%252Fapply%253Fjob%253D81268&signature=abc",
      ),
    ).toBe("https://example.com/apply?job=81268");

    expect(
      parseGradcrackerDetailPage(
        DETAIL_HTML,
        "https://www.gradcracker.com/hub/408/wsp/graduate-job/81268/example",
      ),
    ).toEqual({
      applicationLink: "https://example.com/apply?job=81268",
      jobDescription:
        "Build transport modelling tools.\nWork with Python, data, and simulation platforms.",
    });
  });

  it("fetches list and detail pages with per-term caps", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/graduate-job/81268/")) {
        return createResponse(DETAIL_HTML, { url });
      }
      return createResponse(LIST_HTML, { url });
    });

    const progress = vi.fn();
    const result = await runHttpCrawler({
      searchTerms: ["software systems"],
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock,
      onProgress: progress,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0]).toEqual(
      expect.objectContaining({
        source: "gradcracker",
        employer: "WSP",
        applicationLink: "https://example.com/apply?job=81268",
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({
        listPagesProcessed: 6,
        listPagesTotal: 6,
        jobPagesEnqueued: 1,
        jobPagesProcessed: 0,
      }),
    );
  });

  it("skips known job URLs before fetching detail pages", async () => {
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/graduate-job/81268/")) {
        throw new Error("known jobs should not fetch details");
      }
      return createResponse(LIST_HTML, { url });
    });

    const result = await runHttpCrawler({
      searchTerms: ["software systems"],
      existingJobUrls: [
        "https://www.gradcracker.com/hub/408/wsp/graduate-job/81268/graduate-professional-rail-modelling-and-simulation-analyst",
      ],
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock,
    });

    expect(result).toEqual({ success: true, jobs: [] });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it("reports Cloudflare challenges from the HTTP path", async () => {
    const fetchMock = vi.fn(async (input: string | URL) =>
      createResponse("<title>Just a moment...</title>", {
        ok: false,
        status: 403,
        statusText: "Forbidden",
        url: String(input),
        headers: new Headers({ "cf-mitigated": "challenge" }),
      }),
    );

    const result = await runHttpCrawler({
      searchTerms: ["software systems"],
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(false);
    expect(result.challengeRequired).toContain(
      "software-systems-graduate-jobs-in-london-and-south-east",
    );
  });
});
