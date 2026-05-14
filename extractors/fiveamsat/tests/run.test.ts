import { describe, expect, it, vi } from "vitest";
import { buildFiveamsatSearchUrl } from "../src/fetcher";
import { runFiveamsat } from "../src/run";

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

describe("runFiveamsat", () => {
  it("fetches Khamsat services and limits jobs per term", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createTextResponse(`
        <article class="service-card">
          <a href="/services/programming/one">One</a>
          <span class="price">$5</span>
        </article>
        <article class="service-card">
          <a href="/services/programming/two">Two</a>
          <span class="price">$10</span>
        </article>
      `),
    );

    const result = await runFiveamsat({
      searchTerms: ["node js"],
      maxJobsPerTerm: 1,
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      buildFiveamsatSearchUrl("node js"),
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
        status: 403,
        statusText: "Forbidden",
      }),
    );

    const result = await runFiveamsat({
      searchTerms: ["backend"],
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("403 Forbidden");
    expect(result.error).toContain("https://khamsat.com/services/backend");
  });

  it("does not fetch when cancellation is already requested", async () => {
    const fetchMock = vi.fn();

    const result = await runFiveamsat({
      searchTerms: ["backend"],
      fetchImpl: fetchMock,
      shouldCancel: () => true,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
