import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as tracerLinksRepo from "../repositories/tracer-links";
import {
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
    delete process.env.JOBOPS_PUBLIC_BASE_URL;
  });

  afterEach(() => {
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
    expect(resumeData.basics.url.label).toBe(
      "https://jobops.example.com/cv/tok-1",
    );
    expect(resumeData.sections.projects.items[0].url.href).toBe(
      "https://jobops.example.com/cv/tok-2",
    );
    expect(resumeData.sections.projects.items[0].url.label).toBe(
      "https://jobops.example.com/cv/tok-2",
    );
    expect(resumeData.sections.profiles.items[0].url.href).toBe(
      "https://jobops.example.com/cv/tok-3",
    );
    expect(resumeData.sections.profiles.items[0].url.label).toBe(
      "https://jobops.example.com/cv/tok-3",
    );

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
});
