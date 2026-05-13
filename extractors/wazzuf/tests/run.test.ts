import { describe, expect, it, vi } from "vitest";
import { buildWazzufSearchUrl } from "../src/fetcher";
import { runWazzuf } from "../src/run";

function createTextResponse(
  body: string,
  init: Partial<Response> = {},
): Response {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    text: async () => body,
  } as Response;
}

describe("runWazzuf", () => {
  it("fetches WUZZUF jobs and limits jobs per term", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createTextResponse(`
        <article>
          <a href="/jobs/p/one">One</a>
          <a class="company-name">Acme -</a>
        </article>
        <article>
          <a href="/jobs/p/two">Two</a>
          <a class="company-name">Beta -</a>
        </article>
      `),
    );

    const result = await runWazzuf({
      searchTerms: ["backend"],
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      buildWazzufSearchUrl("backend"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "user-agent": "Mozilla/5.0 (compatible; JobOps/1.0)",
        }),
      }),
    );
  });

  it("returns a descriptive HTTP error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createTextResponse("", {
        ok: false,
        status: 429,
        statusText: "Too Many Requests",
      }),
    );

    const result = await runWazzuf({
      searchTerms: ["backend"],
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("429 Too Many Requests");
    expect(result.error).toContain("https://wuzzuf.net/search/jobs/");
  });

  it("does not fetch when cancellation is already requested", async () => {
    const fetchMock = vi.fn();

    const result = await runWazzuf({
      searchTerms: ["backend"],
      fetchImpl: fetchMock,
      shouldCancel: () => true,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
