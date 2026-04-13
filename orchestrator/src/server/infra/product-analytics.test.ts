import umami from "@umami/node";

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

describe("server product analytics", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBaseUrl = process.env.JOBOPS_PUBLIC_BASE_URL;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.JOBOPS_PUBLIC_BASE_URL = "https://jobops.example";
    vi.clearAllMocks();
    vi.mocked(umami.track).mockResolvedValue(
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
    await trackServerProductEvent(
      "application_offer_detected",
      {
        source: "tracking_inbox_auto",
        stage: "offer",
        token: "secret",
        nested: { ignored: true },
      } as Record<string, unknown>,
      {
        requestOrigin: "https://app.jobops.example",
        urlPath: "/applications/in-progress",
      },
    );

    expect(umami.init).toHaveBeenCalledWith({
      websiteId: "0dc42ed1-87c3-4ac0-9409-5a9b9588fe66",
      hostUrl: "https://umami.dakheera47.com",
      userAgent: "job-ops-server-analytics/1.0",
    });
    expect(umami.track).toHaveBeenCalledWith({
      hostname: "jobops.example",
      url: "/applications/in-progress",
      name: "application_offer_detected",
      data: {
        source: "tracking_inbox_auto",
        stage: "offer",
      },
    });
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not emit analytics during test runs", async () => {
    process.env.NODE_ENV = "test";

    await trackServerProductEvent("resume_generated", {
      origin: "move_to_ready",
    });

    expect(umami.init).not.toHaveBeenCalled();
    expect(umami.track).not.toHaveBeenCalled();
  });

  it("logs a warning when Umami returns a non-ok response", async () => {
    vi.mocked(umami.track).mockResolvedValue(
      new Response(null, { status: 500 }),
    );

    await trackServerProductEvent(
      "resume_generated",
      {
        origin: "move_to_ready",
      },
      {
        requestOrigin: "https://app.jobops.example",
        urlPath: "/jobs",
      },
    );

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
});
