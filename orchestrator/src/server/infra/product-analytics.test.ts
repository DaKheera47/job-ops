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
    vi.clearAllMocks();
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
      },
    });
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
  });

  it("logs a warning when Umami returns a non-ok response", async () => {
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

    expect(delivered).toBe(false);

    expect(logger.warn).toHaveBeenCalledWith(
      "Server product analytics request failed",
      {
        event: "resume_generated",
        status: 500,
        requestOrigin: "https://app.jobops.example",
        urlPath: "/jobs",
      },
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
      },
    });
  });
});
