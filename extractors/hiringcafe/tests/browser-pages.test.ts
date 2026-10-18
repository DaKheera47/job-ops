import { saveCookies } from "browser-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => {
  const makePage = (html: string, status = 200) => ({
    goto: vi.fn(async () => ({ status: () => status })),
    content: vi.fn(async () => html),
    waitForTimeout: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
  });
  const headlessPage = makePage("<html>Just a moment...</html>", 403);
  const headedPage = makePage(
    '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"ssrHits":[]}}}</script>',
  );
  const headlessBrowser = {
    newContext: vi.fn(async () => ({ newPage: async () => headlessPage })),
    close: vi.fn(async () => undefined),
  };
  const headedBrowser = {
    newContext: vi.fn(async () => ({ newPage: async () => headedPage })),
    close: vi.fn(async () => undefined),
  };
  return { headlessPage, headedPage, headlessBrowser, headedBrowser };
});

vi.mock("playwright", () => ({
  firefox: {
    launch: vi.fn(async (options: { headless: boolean }) =>
      options.headless ? fixture.headlessBrowser : fixture.headedBrowser,
    ),
  },
}));
vi.mock("browser-utils", async () => {
  const actual =
    await vi.importActual<typeof import("browser-utils")>("browser-utils");
  return {
    ...actual,
    createLaunchOptions: vi.fn(async ({ headless }) => ({
      launchOptions: { headless },
      usedCamoufox: true,
    })),
    loadCookies: vi.fn(async () => 0),
    saveCookies: vi.fn(async () => 0),
  };
});

import { HiringCafeBrowserPages } from "../src/browser-pages.js";

describe("HiringCafeBrowserPages", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses a clear headed response after a headless challenge without requiring clearance", async () => {
    const release = vi.fn();
    const promoteToHeaded = vi.fn(async () => ({ display: ":99", release }));
    const pages = new HiringCafeBrowserPages({
      cookieStorageDir: "/tmp/hiringcafe-browser-test",
      promoteToHeaded,
    });
    const url = "https://hiringcafe.com/?searchState=test";

    const result = await pages.read(url);

    expect(result).toMatchObject({ status: 200, challenged: false });
    expect(result.html).toContain("__NEXT_DATA__");
    expect(fixture.headlessBrowser.close).toHaveBeenCalledOnce();
    expect(fixture.headedPage.goto).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ waitUntil: "domcontentloaded" }),
    );
    await pages.close();
    expect(release).toHaveBeenCalledOnce();
  });

  it("keeps a challenge pending while the shared viewer is busy", async () => {
    const release = vi.fn();
    const promoteToHeaded = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ display: ":99", release });
    const pages = new HiringCafeBrowserPages({
      cookieStorageDir: "/tmp/hiringcafe-browser-test",
      promoteToHeaded,
    });
    const url = "https://hiringcafe.com/?searchState=test";

    expect((await pages.read(url)).challenged).toBe(true);
    expect(fixture.headlessBrowser.close).not.toHaveBeenCalled();
    expect(pages.canWaitForChallenge(url)).toBe(false);
    expect((await pages.read(url)).challenged).toBe(false);
    await pages.close();
  });

  it("accepts a valid page after a challenge even if cookie persistence fails", async () => {
    const challenge = "<html>Just a moment...</html>";
    fixture.headedPage.content
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce(challenge);
    vi.mocked(saveCookies).mockRejectedValueOnce(new Error("disk full"));
    const pages = new HiringCafeBrowserPages({
      cookieStorageDir: "/tmp/hiringcafe-browser-test",
      promoteToHeaded: async () => ({ release: () => undefined }),
    });
    const url = "https://hiringcafe.com/?searchState=test";

    expect((await pages.read(url)).challenged).toBe(true);
    expect(await pages.waitForChallenge(url, 5_000)).toBe("clear");
    await pages.close();
  });

  it("keeps waiting when the solved page is still navigating", async () => {
    const challenge = "<html>Just a moment...</html>";
    const clear =
      '<script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"ssrHits":[]}}}</script>';
    fixture.headedPage.content
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce(challenge)
      .mockResolvedValueOnce(clear)
      .mockRejectedValueOnce(
        new Error(
          "page.content: Unable to retrieve content because the page is navigating and changing the content.",
        ),
      )
      .mockResolvedValueOnce(clear)
      .mockResolvedValueOnce(clear);
    const pages = new HiringCafeBrowserPages({
      cookieStorageDir: "/tmp/hiringcafe-browser-test",
      promoteToHeaded: async () => ({ release: () => undefined }),
    });
    const url = "https://hiringcafe.com/?searchState=test";

    expect((await pages.read(url)).challenged).toBe(true);
    expect(await pages.waitForChallenge(url, 5_000)).toBe("clear");
    await pages.close();
  });
});
