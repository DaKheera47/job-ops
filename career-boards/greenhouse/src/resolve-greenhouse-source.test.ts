import { describe, expect, it } from "vitest";
import {
  GreenhouseResolutionError,
  resolveGreenhouseSource,
} from "./resolve-greenhouse-source";

interface MockOptions {
  validTokens: Record<string, string | null>;
  pagesByHost?: Record<string, { status: number; html?: string }>;
}

function makeFetch(opts: MockOptions): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const boardMatch = url.match(
      /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)$/,
    );
    if (boardMatch) {
      const token = boardMatch[1];
      if (Object.hasOwn(opts.validTokens, token)) {
        return new Response(JSON.stringify({ name: opts.validTokens[token] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    }

    const host = new URL(url).hostname;
    const page = opts.pagesByHost?.[host];
    if (page) {
      return new Response(page.html ?? "", { status: page.status });
    }
    return new Response("blocked", { status: 403 });
  }) as typeof fetch;
}

describe("resolveGreenhouseSource", () => {
  it("layer 1: parses a Greenhouse URL directly", async () => {
    const resolved = await resolveGreenhouseSource({
      url: "https://job-boards.greenhouse.io/riotgames",
      fetchImpl: makeFetch({ validTokens: { riotgames: "Riot Games" } }),
    });
    expect(resolved).toMatchObject({
      token: "riotgames",
      method: "greenhouse_url",
      companyName: "Riot Games",
      canonicalCareersUrl: "https://job-boards.greenhouse.io/riotgames",
    });
  });

  it("layer 2: scrapes the embedded board token from a company page", async () => {
    const resolved = await resolveGreenhouseSource({
      url: "https://careers.playvalorant.com/openings",
      fetchImpl: makeFetch({
        validTokens: { riotgames: "Riot Games" },
        pagesByHost: {
          "careers.playvalorant.com": {
            status: 200,
            html: '<script src="https://boards.greenhouse.io/embed/job_board/js?for=riotgames"></script>',
          },
        },
      }),
    });
    // Domain guess would be "playvalorant" (invalid), so this must come from scraping.
    expect(resolved.token).toBe("riotgames");
    expect(resolved.method).toBe("page_scrape");
  });

  it("layer 3: guesses the token from the domain when scraping is blocked", async () => {
    const resolved = await resolveGreenhouseSource({
      url: "https://www.epicgames.com/site/careers/jobs",
      fetchImpl: makeFetch({
        validTokens: { epicgames: "Epic Games" },
        pagesByHost: { "www.epicgames.com": { status: 403 } },
      }),
    });
    expect(resolved).toMatchObject({
      token: "epicgames",
      method: "domain_guess",
      companyName: "Epic Games",
    });
  });

  it("throws NOT_FOUND when no board can be located", async () => {
    await expect(
      resolveGreenhouseSource({
        url: "https://www.nianticlabs.com/careers",
        fetchImpl: makeFetch({
          validTokens: {},
          pagesByHost: {
            "www.nianticlabs.com": {
              status: 200,
              html: "<html>no board here</html>",
            },
          },
        }),
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects empty and malformed input", async () => {
    await expect(
      resolveGreenhouseSource({
        url: "  ",
        fetchImpl: makeFetch({ validTokens: {} }),
      }),
    ).rejects.toBeInstanceOf(GreenhouseResolutionError);
    await expect(
      resolveGreenhouseSource({
        url: "not a url",
        fetchImpl: makeFetch({ validTokens: {} }),
      }),
    ).rejects.toMatchObject({ code: "INVALID_URL" });
  });
});
