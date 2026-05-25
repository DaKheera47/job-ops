import type { AppError } from "@infra/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  extractBodyText,
  graphApi,
  O365_OAUTH_SCOPE,
  resolveO365AccessToken,
} from "./o365-api";

describe("o365 sync http behavior", () => {
  const originalClientId = process.env.O365_OAUTH_CLIENT_ID;
  const originalClientSecret = process.env.O365_OAUTH_CLIENT_SECRET;
  const originalTenantId = process.env.O365_OAUTH_TENANT_ID;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.O365_OAUTH_CLIENT_ID = "client-id";
    process.env.O365_OAUTH_CLIENT_SECRET = "client-secret";
    process.env.O365_OAUTH_TENANT_ID = "tenant-id";
  });

  afterEach(() => {
    process.env.O365_OAUTH_CLIENT_ID = originalClientId;
    process.env.O365_OAUTH_CLIENT_SECRET = originalClientSecret;
    process.env.O365_OAUTH_TENANT_ID = originalTenantId;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("maps token refresh abort to REQUEST_TIMEOUT", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError"),
    );

    await expect(
      resolveO365AccessToken({ refreshToken: "refresh-token" }),
    ).rejects.toMatchObject({
      status: 408,
      code: "REQUEST_TIMEOUT",
    } satisfies Partial<AppError>);
  });

  it("throws upstream token refresh error when response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ error: "invalid_grant" }),
    } as unknown as Response);

    await expect(
      resolveO365AccessToken({ refreshToken: "refresh-token" }),
    ).rejects.toThrow("O365 token refresh failed with HTTP 401.");
  });

  it("adopts rotated refresh token when Microsoft returns a new one", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        expires_in: 3600,
        refresh_token: "rotated-refresh-token",
      }),
    } as unknown as Response);

    const result = await resolveO365AccessToken({
      refreshToken: "original-refresh-token",
    });

    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBe("rotated-refresh-token");
  });

  it("includes the granted scope when refreshing an O365 token", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        expires_in: 3600,
      }),
    } as unknown as Response);

    await resolveO365AccessToken({
      refreshToken: "original-refresh-token",
      scope: "offline_access Mail.ReadBasic User.Read",
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const params = new URLSearchParams(String(init?.body));
    expect(params.get("scope")).toBe("offline_access Mail.ReadBasic User.Read");
  });

  it("falls back to the shared O365 scope when refreshing without stored scope", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        expires_in: 3600,
      }),
    } as unknown as Response);

    await resolveO365AccessToken({
      refreshToken: "original-refresh-token",
    });

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const params = new URLSearchParams(String(init?.body));
    expect(params.get("scope")).toBe(O365_OAUTH_SCOPE);
  });

  it("keeps the original refresh token when Microsoft does not return a new one", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        expires_in: 3600,
        // no refresh_token field
      }),
    } as unknown as Response);

    const result = await resolveO365AccessToken({
      refreshToken: "original-refresh-token",
    });

    expect(result.accessToken).toBe("new-access-token");
    expect(result.refreshToken).toBe("original-refresh-token");
  });

  it("maps graph API abort to REQUEST_TIMEOUT", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError"),
    );

    await expect(
      graphApi("access-token", "https://graph.microsoft.com/v1.0/me"),
    ).rejects.toMatchObject({
      status: 408,
      code: "REQUEST_TIMEOUT",
    } satisfies Partial<AppError>);
  });

  it("throws when graph API response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);

    await expect(
      graphApi("access-token", "https://graph.microsoft.com/v1.0/me"),
    ).rejects.toThrow("Microsoft Graph API request failed (502).");
  });
});

describe("o365 sync body extraction", () => {
  it("removes scripts/styles/images and strips link URLs from html bodies", () => {
    const body = extractBodyText({
      id: "message-1",
      conversationId: "thread-1",
      subject: "Subject",
      bodyPreview: "",
      from: { emailAddress: { address: "jobs@example.com" } },
      receivedDateTime: new Date().toISOString(),
      body: {
        contentType: "html",
        content: `
          <html>
            <head>
              <style>.hidden { display: none; }</style>
              <script>console.log("secret");</script>
            </head>
            <body>
              <p>Hello <strong>there</strong>.</p>
              <a href="https://example.com/apply?token=abc">Apply now</a>
              <img src="https://example.com/banner.png" alt="Banner">
            </body>
          </html>
        `,
      },
    });

    expect(body).toContain("Hello there.");
    expect(body).toContain("Apply now");
    expect(body).not.toContain("https://example.com/apply?token=abc");
    expect(body).not.toContain("display: none");
    expect(body).not.toContain('console.log("secret")');
    expect(body).not.toContain("banner.png");
  });
});
