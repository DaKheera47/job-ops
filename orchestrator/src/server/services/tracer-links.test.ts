import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as tracerLinksRepo from "../repositories/tracer-links";
import {
  _resetTracerReadinessCacheForTests,
  getTracerReadiness,
  resolveTracerPublicBaseUrl,
  resolveTracerRedirect,
  rewriteResumeLinksWithTracer,
} from "./tracer-links";

vi.mock("../repositories/tracer-links", () => ({
  getOrCreateTracerLink: vi.fn(),
  findActiveTracerLinkByToken: vi.fn(),
  insertTracerClickEvent: vi.fn(),
  getTracerAnalyticsTotals: vi.fn(),
  getTracerAnalyticsTimeSeries: vi.fn(),
  getTracerAnalyticsTopJobs: vi.fn(),
  getTracerAnalyticsTopLinks: vi.fn(),
  listTracerLinkStatsByJob: vi.fn(),
}));

describe("tracer-links service", () => {
  const originalEnv = process.env.JOBOPS_PUBLIC_BASE_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    _resetTracerReadinessCacheForTests();
    vi.unstubAllGlobals();
    delete process.env.JOBOPS_PUBLIC_BASE_URL;
  });

  afterEach(() => {
    _resetTracerReadinessCacheForTests();
    vi.unstubAllGlobals();
    if (originalEnv === undefined) {
      delete process.env.JOBOPS_PUBLIC_BASE_URL;
    } else {
      process.env.JOBOPS_PUBLIC_BASE_URL = originalEnv;
    }
  });

  it("rewrites all eligible resume url fields", async () => {
    const resumeData = {
      basics: {
        name: "Sarfaraz Khan",
        url: {
          label: "Portfolio",
          href: "https://portfolio.example.com",
        },
      },
      sections: {
        projects: {
          items: [
            {
              name: "P1",
              url: {
                label: "",
                href: "https://projects.example.com/p1",
              },
            },
            {
              name: "P2",
              url: {
                label: "",
                href: "mailto:hello@example.com",
              },
            },
          ],
        },
        profiles: {
          items: [
            {
              network: "GitHub",
              url: {
                label: "GitHub",
                href: "https://github.com/example",
              },
            },
          ],
        },
      },
    };

    vi.mocked(tracerLinksRepo.getOrCreateTracerLink)
      .mockResolvedValueOnce({
        id: "l1",
        token: "tok-1",
      } as any)
      .mockResolvedValueOnce({
        id: "l2",
        token: "tok-2",
      } as any)
      .mockResolvedValueOnce({
        id: "l3",
        token: "tok-3",
      } as any);

    const result = await rewriteResumeLinksWithTracer({
      jobId: "job-1",
      resumeData,
      publicBaseUrl: "https://jobops.example.com",
      companyName: "Amazon",
    });

    expect(result.rewrittenLinks).toBe(3);
    expect(resumeData.basics.url.href).toBe(
      "https://jobops.example.com/cv/tok-1",
    );
    expect(resumeData.basics.url.label).toBe("Portfolio");
    expect(resumeData.sections.projects.items[0].url.href).toBe(
      "https://jobops.example.com/cv/tok-2",
    );
    expect(resumeData.sections.projects.items[0].url.label).toBe(
      "https://jobops.example.com/cv/tok-2",
    );
    expect(resumeData.sections.profiles.items[0].url.href).toBe(
      "https://jobops.example.com/cv/tok-3",
    );
    expect(resumeData.sections.profiles.items[0].url.label).toBe("GitHub");

    // Non-http links are untouched.
    expect(resumeData.sections.projects.items[1].url.href).toBe(
      "mailto:hello@example.com",
    );

    expect(
      vi.mocked(tracerLinksRepo.getOrCreateTracerLink),
    ).toHaveBeenCalledTimes(3);
    expect(
      vi.mocked(tracerLinksRepo.getOrCreateTracerLink),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        sourcePath: "basics.url.href",
        slugPrefix: "amazon",
      }),
    );
    expect(
      vi.mocked(tracerLinksRepo.getOrCreateTracerLink),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: "job-1",
        sourcePath: "sections.projects.items[0].url.href",
        sourceLabel: "Project Link 1",
      }),
    );
  });

  it("resolves public base url from request origin first, then env fallback", () => {
    process.env.JOBOPS_PUBLIC_BASE_URL = "https://fallback.example.com/";

    expect(
      resolveTracerPublicBaseUrl({
        requestOrigin: "https://request.example.com/",
      }),
    ).toBe("https://request.example.com");

    expect(
      resolveTracerPublicBaseUrl({
        requestOrigin: null,
      }),
    ).toBe("https://fallback.example.com");
  });

  it("records redirect click metadata without storing raw IP", async () => {
    vi.mocked(tracerLinksRepo.findActiveTracerLinkByToken).mockResolvedValue({
      id: "link-1",
      token: "tok-abc",
      jobId: "job-1",
      destinationUrl: "https://github.com/example",
      sourcePath: "sections.profiles.items[0].url.href",
      sourceLabel: "GitHub",
    });

    const redirect = await resolveTracerRedirect({
      token: "tok-abc",
      requestId: "req-1",
      ip: "203.0.113.42",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit",
      referrer: "https://mail.example.com/thread/123",
    });

    expect(redirect).toEqual({
      destinationUrl: "https://github.com/example",
      jobId: "job-1",
    });
    expect(
      vi.mocked(tracerLinksRepo.insertTracerClickEvent),
    ).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(tracerLinksRepo.insertTracerClickEvent),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        tracerLinkId: "link-1",
        requestId: "req-1",
        referrerHost: "mail.example.com",
        ipHash: expect.any(String),
        uniqueFingerprintHash: expect.any(String),
      }),
    );
  });

  it("reports unconfigured readiness when no public base URL is available", async () => {
    const readiness = await getTracerReadiness({ requestOrigin: null });

    expect(readiness.status).toBe("unconfigured");
    expect(readiness.canEnable).toBe(false);
    expect(readiness.publicBaseUrl).toBeNull();
    expect(readiness.reason).toMatch(/no public jobops base url/i);
  });

  it("reports unavailable readiness for localhost/private origins", async () => {
    const readiness = await getTracerReadiness({
      requestOrigin: "http://localhost:3000",
    });

    expect(readiness.status).toBe("unavailable");
    expect(readiness.canEnable).toBe(false);
    expect(readiness.reason).toMatch(/internet-reachable/i);
  });

  it("reports ready readiness when health check succeeds", async () => {
    process.env.JOBOPS_PUBLIC_BASE_URL = "https://my-jobops.example.com";
    const realFetch = global.fetch;
    const mockFetch = vi.fn(async (input: any, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url === "https://my-jobops.example.com/health") {
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      }
      return realFetch(input, init);
    });
    vi.stubGlobal("fetch", mockFetch);

    const readiness = await getTracerReadiness({
      requestOrigin: null,
      force: true,
    });

    expect(readiness.status).toBe("ready");
    expect(readiness.canEnable).toBe(true);
    expect(readiness.publicBaseUrl).toBe("https://my-jobops.example.com");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://my-jobops.example.com/health",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("classifies browser-like bot user agents as bot family", async () => {
    vi.mocked(tracerLinksRepo.findActiveTracerLinkByToken).mockResolvedValue({
      id: "link-2",
      token: "tok-bot",
      jobId: "job-1",
      destinationUrl: "https://github.com/example",
      sourcePath: "sections.profiles.items[0].url.href",
      sourceLabel: "GitHub",
    });

    await resolveTracerRedirect({
      token: "tok-bot",
      requestId: "req-bot",
      ip: "203.0.113.13",
      userAgent: "Mozilla/5.0 Chrome/126.0.0.0 LinkedInBot",
      referrer: null,
    });

    expect(
      vi.mocked(tracerLinksRepo.insertTracerClickEvent),
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        isLikelyBot: true,
        uaFamily: "bot",
      }),
    );
  });

  it("fails closed when redirect destination is not http(s)", async () => {
    vi.mocked(tracerLinksRepo.findActiveTracerLinkByToken).mockResolvedValue({
      id: "link-3",
      token: "tok-invalid",
      jobId: "job-1",
      destinationUrl: "javascript:alert(1)",
      sourcePath: "basics.url.href",
      sourceLabel: "Portfolio",
    });

    const redirect = await resolveTracerRedirect({
      token: "tok-invalid",
      requestId: "req-invalid",
      ip: "203.0.113.25",
      userAgent: "Mozilla/5.0",
      referrer: null,
    });

    expect(redirect).toBeNull();
    expect(
      vi.mocked(tracerLinksRepo.insertTracerClickEvent),
    ).not.toHaveBeenCalled();
  });
});
