import { describe, expect, it, vi } from "vitest";
import { buildUpworkRssUrl } from "../src/fetcher";
import { runUpwork } from "../src/run";

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

describe("runUpwork", () => {
  it("fetches one RSS URL per term and returns parsed jobs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createTextResponse(`
        <rss>
          <channel>
            <item>
              <title>Backend Engineer</title>
              <link>https://www.upwork.com/jobs/~backend</link>
              <description>Budget: $300 Posted On: today</description>
            </item>
          </channel>
        </rss>
      `),
    );

    const result = await runUpwork({
      searchTerms: ["backend engineer"],
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      buildUpworkRssUrl("backend engineer", 10),
      expect.objectContaining({
        headers: expect.objectContaining({
          "user-agent": "Mozilla/5.0 (compatible; JobOps/1.0)",
        }),
      }),
    );
  });

  it("returns a descriptive error when RSS probing fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      createTextResponse("", {
        ok: false,
        status: 410,
        statusText: "Gone",
      }),
    );

    const result = await runUpwork({
      searchTerms: ["backend"],
      fetchImpl: fetchMock,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("410 Gone");
    expect(result.error).toContain("https://www.upwork.com/ab/feed/jobs/rss");
  });

  it("does not fetch when cancellation is already requested", async () => {
    const fetchMock = vi.fn();

    const result = await runUpwork({
      searchTerms: ["backend"],
      fetchImpl: fetchMock,
      shouldCancel: () => true,
    });

    expect(result.success).toBe(true);
    expect(result.jobs).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
