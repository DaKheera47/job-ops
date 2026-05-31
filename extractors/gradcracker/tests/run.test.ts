import { describe, expect, it, vi } from "vitest";
import {
  decodeGradcrackerOutUrl,
  parseGradcrackerDetailPage,
  parseGradcrackerListPage,
  parseGradcrackerProgressLine,
  runHttpCrawler,
  summarizeGradcrackerBrowserFailure,
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

  it("paces HTTP request starts when a delay is configured", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    try {
      const requestStartedAt: number[] = [];
      const fetchMock = vi.fn(async (input: string | URL) => {
        requestStartedAt.push(Date.now());
        const url = String(input);
        if (url.includes("/graduate-job/81268/")) {
          return createResponse(DETAIL_HTML, { url });
        }
        return createResponse(LIST_HTML, { url });
      });

      const resultPromise = runHttpCrawler({
        searchTerms: ["software systems"],
        maxJobsPerTerm: 1,
        fetchImpl: fetchMock,
        requestDelayMs: 100,
      });

      await vi.advanceTimersByTimeAsync(0);
      expect(requestStartedAt).toEqual([0]);

      await vi.advanceTimersByTimeAsync(99);
      expect(requestStartedAt).toEqual([0]);

      await vi.advanceTimersByTimeAsync(1);
      await expect(resultPromise).resolves.toMatchObject({
        success: true,
        jobs: [expect.objectContaining({ employer: "WSP" })],
      });
      expect(requestStartedAt).toEqual([0, 100]);
    } finally {
      vi.useRealTimers();
    }
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

  it("detects child-process Cloudflare progress signals", () => {
    expect(
      parseGradcrackerProgressLine(
        'JOBOPS_PROGRESS {"event":"challenge_required","url":"https://www.gradcracker.com/challenge"}',
      ),
    ).toEqual({
      type: "challenge_required",
      url: "https://www.gradcracker.com/challenge",
    });

    expect(
      parseGradcrackerProgressLine(
        'JOBOPS_PROGRESS {"phase":"list","listPagesProcessed":1,"jobCardsFound":12}',
      ),
    ).toEqual({
      type: "progress",
      progress: {
        phase: "list",
        listPagesProcessed: 1,
        jobCardsFound: 12,
      },
    });
  });

  it("summarizes missing Playwright browser fallback failures", () => {
    expect(
      summarizeGradcrackerBrowserFailure(
        [
          "Failed to launch browser. Please check the following:",
          "browserType.launchPersistentContext: Executable doesn't exist at /ms-playwright/firefox-1511/firefox/firefox",
          "Please run the following command to download new browsers:",
          "npx playwright install",
        ],
        "Crawler exited with code 1",
      ),
    ).toBe(
      "Gradcracker browser fallback could not launch Playwright Firefox. Missing executable: /ms-playwright/firefox-1511/firefox/firefox. Rebuild the Docker image so the Node Playwright browser binary is installed, or run `npx playwright install firefox` in the runtime image.",
    );
  });
});
