import umamiModule from "@umami/node";

import { logger } from "./logger";
import { trackServerProductEvent } from "./product-analytics";

vi.mock("@umami/node", () => ({
  default: {
    init: vi.fn(),
    track: vi.fn(),
  },
}));

vi.mock("./logger", () => ({
  logger: {
    warn: vi.fn(),
  },
}));

vi.mock("@server/repositories/product-analytics", () => ({
  getOrCreateAnalyticsInstallState: vi.fn().mockResolvedValue({
    id: "default",
    distinctId: "install-distinct-id",
    installedAt: "2026-02-20T00:00:00.000Z",
    createdAt: "2026-02-20T00:00:00.000Z",
    updatedAt: "2026-02-20T00:00:00.000Z",
  }),
}));

describe("server product analytics", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBaseUrl = process.env.JOBOPS_PUBLIC_BASE_URL;
  const originalAppVersion = process.env.JOBOPS_APP_VERSION;
  const fetchMock = vi.fn<typeof fetch>();
  const getMockUmami = () =>
    (typeof umamiModule === "object" &&
    umamiModule !== null &&
    "default" in umamiModule
      ? umamiModule.default
      : umamiModule) as {
      init: ReturnType<typeof vi.fn>;
      track: ReturnType<typeof vi.fn>;
    };

  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.JOBOPS_PUBLIC_BASE_URL = "https://jobops.example";
    process.env.JOBOPS_APP_VERSION = "v0.test";
    process.env.JOBOPS_OPENPANEL_API_URL =
      "https://openpanel.dakheera47.com/api";
    process.env.JOBOPS_OPENPANEL_CLIENT_ID =
      "6a953241-309b-4e5a-be1b-412c5d7b6544";
    vi.clearAllMocks();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(getMockUmami().track).mockResolvedValue(
      new Response(null, { status: 202 }),
    );
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalBaseUrl === undefined) {
      delete process.env.JOBOPS_PUBLIC_BASE_URL;
    } else {
      process.env.JOBOPS_PUBLIC_BASE_URL = originalBaseUrl;
    }
    if (originalAppVersion === undefined) {
      delete process.env.JOBOPS_APP_VERSION;
    } else {
      process.env.JOBOPS_APP_VERSION = originalAppVersion;
    }
  });

  it("sends Umami-compatible event payloads with sanitized data", async () => {
    const delivered = await trackServerProductEvent(
      "application_offer_detected",
      {
        source: "tracking_inbox_auto",
        stage: "offer",
        token: "secret",
        nested: { ignored: true },
      } as Record<string, unknown>,
      {
        requestOrigin: "https://app.jobops.example",
        requestUserAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        occurredAt: 1_711_929_600_000,
        sessionId: "session-123",
        urlPath: "/applications/in-progress",
      },
    );

    expect(delivered).toBe(true);

    expect(getMockUmami().init).toHaveBeenCalledWith({
      websiteId: "0dc42ed1-87c3-4ac0-9409-5a9b9588fe66",
      hostUrl: "https://umami.dakheera47.com",
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
    });
    expect(getMockUmami().track).toHaveBeenCalledWith({
      id: "install-distinct-id",
      timestamp: 1_711_929_600,
      hostname: "jobops.example",
      url: "/applications/in-progress",
      name: "application_offer_detected",
      data: {
        source: "tracking_inbox_auto",
        stage: "offer",
        sessionId: "session-123",
        analytics_user_id: "install-distinct-id",
        app_version: "v0.test",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openpanel.dakheera47.com/api/track",
      {
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "openpanel-client-id": "6a953241-309b-4e5a-be1b-412c5d7b6544",
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        }),
        body: JSON.stringify({
          type: "track",
          payload: {
            name: "application_offer_detected",
            profileId: "install-distinct-id",
            properties: {
              source: "tracking_inbox_auto",
              stage: "offer",
              sessionId: "session-123",
              analytics_user_id: "install-distinct-id",
              app_version: "v0.test",
              __path: "/applications/in-progress",
              __timestamp: "2024-04-01T00:00:00.000Z",
            },
          },
        }),
      },
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not emit analytics during test runs", async () => {
    process.env.NODE_ENV = "test";

    const delivered = await trackServerProductEvent("resume_generated", {
      origin: "move_to_ready",
    });

    expect(delivered).toBe(false);
    expect(getMockUmami().init).not.toHaveBeenCalled();
    expect(getMockUmami().track).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns delivered when OpenPanel succeeds even if Umami fails", async () => {
    vi.mocked(getMockUmami().track).mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    const delivered = await trackServerProductEvent(
      "resume_generated",
      {
        origin: "move_to_ready",
      },
      {
        requestOrigin: "https://app.jobops.example",
        urlPath: "/jobs",
      },
    );

    expect(delivered).toBe(true);

    expect(logger.warn).toHaveBeenCalledWith(
      "Server product analytics request failed",
      {
        provider: "umami",
        event: "resume_generated",
        status: 500,
        requestOrigin: "https://app.jobops.example",
        urlPath: "/jobs",
      },
    );
  });

  it("returns delivered when OpenPanel succeeds even if Umami throws", async () => {
    vi.mocked(getMockUmami().track).mockRejectedValue(new Error("umami down"));

    const delivered = await trackServerProductEvent(
      "resume_generated",
      {
        origin: "move_to_ready",
      },
      {
        requestOrigin: "https://app.jobops.example",
        urlPath: "/jobs",
      },
    );

    expect(delivered).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      "Server product analytics request errored",
      expect.objectContaining({
        provider: "umami",
        event: "resume_generated",
        requestOrigin: "https://app.jobops.example",
        urlPath: "/jobs",
      }),
    );
  });

  it("supports the commonjs module-object shape exposed at runtime", async () => {
    vi.doMock("@umami/node", () => ({
      default: {
        default: {
          init: vi.fn(),
          track: vi.fn().mockResolvedValue(new Response(null, { status: 202 })),
        },
      },
    }));

    vi.resetModules();
    const { trackServerProductEvent: trackWithCommonJsShape } = await import(
      "./product-analytics"
    );
    const remockedModule = await import("@umami/node");
    const runtimeUmami = (
      remockedModule.default as unknown as {
        default: {
          init: ReturnType<typeof vi.fn>;
          track: ReturnType<typeof vi.fn>;
        };
      }
    ).default;

    const delivered = await trackWithCommonJsShape(
      "application_marked_applied",
      undefined,
      {
        requestOrigin: "https://app.jobops.example",
        occurredAt: 1_711_929_600_000,
        sessionId: "session-commonjs",
        urlPath: "/jobs",
      },
    );

    expect(delivered).toBe(true);
    expect(runtimeUmami.init).toHaveBeenCalledTimes(1);
    expect(runtimeUmami.track).toHaveBeenCalledWith({
      id: "install-distinct-id",
      timestamp: 1_711_929_600,
      hostname: "jobops.example",
      url: "/jobs",
      name: "application_marked_applied",
      data: {
        sessionId: "session-commonjs",
        analytics_user_id: "install-distinct-id",
        app_version: "v0.test",
      },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://openpanel.dakheera47.com/api/track",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("logs and returns false when both providers fail", async () => {
    vi.mocked(getMockUmami().track).mockResolvedValue(
      new Response(null, { status: 500 }),
    );
    fetchMock.mockResolvedValue(new Response(null, { status: 500 }));

    const delivered = await trackServerProductEvent(
      "application_marked_applied",
      { source: "jobs_page" },
      {
        requestOrigin: "https://app.jobops.example",
        urlPath: "/jobs/all",
      },
    );

    expect(delivered).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      "Server product analytics request failed",
      expect.objectContaining({
        provider: "openpanel",
        event: "application_marked_applied",
        status: 500,
      }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      "Server product analytics request failed",
      expect.objectContaining({
        provider: "umami",
        event: "application_marked_applied",
        status: 500,
      }),
    );
  });
});
