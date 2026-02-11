import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

vi.mock("../../services/post-application/providers", () => ({
  executePostApplicationProviderAction: vi.fn(),
}));

describe.sequential("Post-Application Provider actions API", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;
  const originalClientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const originalClientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const originalRedirectUri = process.env.GMAIL_OAUTH_REDIRECT_URI;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    process.env.GMAIL_OAUTH_CLIENT_ID = originalClientId;
    process.env.GMAIL_OAUTH_CLIENT_SECRET = originalClientSecret;
    process.env.GMAIL_OAUTH_REDIRECT_URI = originalRedirectUri;
    await stopServer({ server, closeDb, tempDir });
    vi.clearAllMocks();
  });

  it("dispatches provider status action and returns unified success contract", async () => {
    const { executePostApplicationProviderAction } = await import(
      "../../services/post-application/providers"
    );
    vi.mocked(executePostApplicationProviderAction).mockResolvedValueOnce({
      provider: "gmail",
      action: "status",
      accountKey: "primary",
      status: {
        provider: "gmail",
        accountKey: "primary",
        connected: false,
        integration: null,
      },
    });

    const res = await fetch(
      `${baseUrl}/api/post-application/providers/gmail/actions/status`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req-post-app-1",
        },
        body: JSON.stringify({ accountKey: "primary" }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-post-app-1");
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({
      provider: "gmail",
      action: "status",
      accountKey: "primary",
      status: {
        provider: "gmail",
        accountKey: "primary",
        connected: false,
        integration: null,
      },
    });
    expect(body.meta.requestId).toBe("req-post-app-1");
    expect(executePostApplicationProviderAction).toHaveBeenCalledWith({
      provider: "gmail",
      action: "status",
      accountKey: "primary",
      connectPayload: undefined,
      syncPayload: undefined,
      initiatedBy: null,
    });
  });

  it("defaults to account key 'default' when omitted", async () => {
    const { executePostApplicationProviderAction } = await import(
      "../../services/post-application/providers"
    );
    vi.mocked(executePostApplicationProviderAction).mockResolvedValueOnce({
      provider: "gmail",
      action: "connect",
      accountKey: "default",
      status: {
        provider: "gmail",
        accountKey: "default",
        connected: true,
        integration: null,
      },
    });

    const res = await fetch(
      `${baseUrl}/api/post-application/providers/gmail/actions/connect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            refreshToken: "redacted-token",
          },
        }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(executePostApplicationProviderAction).toHaveBeenCalledWith({
      provider: "gmail",
      action: "connect",
      accountKey: "default",
      connectPayload: {
        payload: {
          refreshToken: "redacted-token",
        },
      },
      syncPayload: undefined,
      initiatedBy: null,
    });
  });

  it("returns 400 INVALID_REQUEST for unsupported actions", async () => {
    const res = await fetch(
      `${baseUrl}/api/post-application/providers/gmail/actions/invalid`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("maps provider service errors to standardized error responses", async () => {
    const { executePostApplicationProviderAction } = await import(
      "../../services/post-application/providers"
    );
    const { AppError } = await import("@infra/errors");
    vi.mocked(executePostApplicationProviderAction).mockRejectedValueOnce(
      new AppError({
        status: 503,
        code: "SERVICE_UNAVAILABLE",
        message: "Provider temporarily unavailable",
      }),
    );

    const res = await fetch(
      `${baseUrl}/api/post-application/providers/gmail/actions/sync`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountKey: "primary", maxMessages: 20 }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.message).toBe("Provider temporarily unavailable");
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("starts gmail oauth flow and returns authorization url", async () => {
    process.env.GMAIL_OAUTH_CLIENT_ID = "client-id";
    process.env.GMAIL_OAUTH_CLIENT_SECRET = "client-secret";
    process.env.GMAIL_OAUTH_REDIRECT_URI = `${baseUrl}/oauth/gmail/callback`;

    const res = await fetch(
      `${baseUrl}/api/post-application/providers/gmail/oauth/start?accountKey=primary`,
      {
        headers: {
          "x-request-id": "req-post-app-oauth-start",
        },
      },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-post-app-oauth-start");
    expect(body.ok).toBe(true);
    expect(body.data.provider).toBe("gmail");
    expect(body.data.accountKey).toBe("primary");
    expect(typeof body.data.state).toBe("string");
    expect(body.data.authorizationUrl).toContain(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(body.data.authorizationUrl).toContain("response_type=code");
    expect(body.meta.requestId).toBe("req-post-app-oauth-start");
  });

  it("returns 400 INVALID_REQUEST when oauth exchange state is invalid", async () => {
    process.env.GMAIL_OAUTH_CLIENT_ID = "client-id";
    process.env.GMAIL_OAUTH_CLIENT_SECRET = "client-secret";
    process.env.GMAIL_OAUTH_REDIRECT_URI = `${baseUrl}/oauth/gmail/callback`;

    const res = await fetch(
      `${baseUrl}/api/post-application/providers/gmail/oauth/exchange`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountKey: "default",
          state: "missing-state",
          code: "oauth-code",
        }),
      },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.message).toContain("invalid or expired");
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("returns 503 SERVICE_UNAVAILABLE when gmail oauth config is missing", async () => {
    delete process.env.GMAIL_OAUTH_CLIENT_ID;
    delete process.env.GMAIL_OAUTH_CLIENT_SECRET;
    delete process.env.GMAIL_OAUTH_REDIRECT_URI;

    const res = await fetch(
      `${baseUrl}/api/post-application/providers/gmail/oauth/start`,
    );
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.message).toContain("Gmail OAuth is not configured");
    expect(typeof body.meta.requestId).toBe("string");
  });
});
