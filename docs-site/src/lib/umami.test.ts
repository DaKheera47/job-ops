import {
  DEFAULT_DOCS_UMAMI_WEBSITE_ID,
  DEMO_DOCS_UMAMI_WEBSITE_ID,
  ensureDocsUmamiScript,
  installDocsUmamiClickTracking,
  resolveDocsUmamiConfig,
} from "./umami";

describe("docs umami", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("uses the direct umami script for standalone docs dev", () => {
    const config = resolveDocsUmamiConfig({
      demoMode: false,
      location: {
        hostname: "localhost",
        port: "3006",
      },
    });

    expect(config.websiteId).toBe(DEFAULT_DOCS_UMAMI_WEBSITE_ID);
    expect(config.scriptSrc).toBe("https://umami.dakheera47.com/script.js");
    expect(config.hostUrl).toBe("https://umami.dakheera47.com");
  });

  it("uses the proxy path and demo website id when demo mode is enabled", () => {
    const config = resolveDocsUmamiConfig({
      demoMode: true,
      location: {
        hostname: "jobops.dakheera47.com",
        port: "",
      },
    });

    expect(config.websiteId).toBe(DEMO_DOCS_UMAMI_WEBSITE_ID);
    expect(config.scriptSrc).toBe("/stats/script.js");
    expect(config.hostUrl).toBe("/stats");
  });

  it("injects the umami script once with the resolved attributes", () => {
    ensureDocsUmamiScript({
      config: {
        demoMode: false,
        scriptSrc: "/stats/script.js",
        hostUrl: "/stats",
        websiteId: DEFAULT_DOCS_UMAMI_WEBSITE_ID,
      },
      document,
    });
    ensureDocsUmamiScript({
      config: {
        demoMode: true,
        scriptSrc: "/stats/script.js",
        hostUrl: "/stats",
        websiteId: DEMO_DOCS_UMAMI_WEBSITE_ID,
      },
      document,
    });

    const scripts = document.querySelectorAll(
      'script[data-jobops-umami="docs"]',
    );
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.getAttribute("data-website-id")).toBe(
      DEFAULT_DOCS_UMAMI_WEBSITE_ID,
    );
    expect(scripts[0]?.getAttribute("data-host-url")).toBe("/stats");
  });

  it("tracks custom docs CTA clicks", () => {
    const track = vi.fn();
    window.umami = { track };
    const cleanup = installDocsUmamiClickTracking({
      document,
      windowObject: window,
    });

    const anchor = document.createElement("a");
    anchor.dataset.umamiEvent = "docs_intro_self_hosting_click";
    document.body.appendChild(anchor);

    anchor.click();

    expect(track).toHaveBeenCalledWith(
      "docs_intro_self_hosting_click",
      undefined,
    );

    cleanup();
    delete window.umami;
  });
});
