import { trackServerProductEvent } from "./product-analytics";

describe("server product analytics", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBaseUrl = process.env.JOBOPS_PUBLIC_BASE_URL;

  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.JOBOPS_PUBLIC_BASE_URL = "https://jobops.example";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 202 })),
    );
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    if (originalBaseUrl === undefined) {
      delete process.env.JOBOPS_PUBLIC_BASE_URL;
    } else {
      process.env.JOBOPS_PUBLIC_BASE_URL = originalBaseUrl;
    }
    vi.unstubAllGlobals();
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

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];

    expect(url).toBe("https://umami.dakheera47.com/api/send");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({
      "content-type": "application/json",
      "user-agent": "job-ops-server-analytics/1.0",
    });

    const payload = JSON.parse(String(init?.body)) as {
      type: string;
      payload: {
        website: string;
        hostname: string;
        url: string;
        name: string;
        data?: Record<string, unknown>;
      };
    };

    expect(payload).toEqual({
      type: "event",
      payload: {
        website: "0dc42ed1-87c3-4ac0-9409-5a9b9588fe66",
        hostname: "jobops.example",
        url: "/applications/in-progress",
        name: "application_offer_detected",
        data: {
          source: "tracking_inbox_auto",
          stage: "offer",
        },
      },
    });
  });

  it("does not emit analytics during test runs", async () => {
    process.env.NODE_ENV = "test";

    await trackServerProductEvent("resume_generated", {
      origin: "move_to_ready",
    });

    expect(fetch).not.toHaveBeenCalled();
  });
});
