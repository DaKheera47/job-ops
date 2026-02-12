import type { AppError } from "@infra/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __test__, gmailApi, resolveGmailAccessToken } from "./gmail-sync";

describe("gmail sync http behavior", () => {
  const originalClientId = process.env.GMAIL_OAUTH_CLIENT_ID;
  const originalClientSecret = process.env.GMAIL_OAUTH_CLIENT_SECRET;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    process.env.GMAIL_OAUTH_CLIENT_ID = "client-id";
    process.env.GMAIL_OAUTH_CLIENT_SECRET = "client-secret";
  });

  afterEach(() => {
    process.env.GMAIL_OAUTH_CLIENT_ID = originalClientId;
    process.env.GMAIL_OAUTH_CLIENT_SECRET = originalClientSecret;
    vi.restoreAllMocks();
  });

  it("maps token refresh abort to REQUEST_TIMEOUT", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError"),
    );

    await expect(
      resolveGmailAccessToken({ refreshToken: "refresh-token" }),
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
      resolveGmailAccessToken({ refreshToken: "refresh-token" }),
    ).rejects.toThrow("Gmail token refresh failed with HTTP 401.");
  });

  it("returns refreshed credentials when token refresh succeeds", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        expires_in: 1200,
      }),
    } as unknown as Response);

    const refreshed = await resolveGmailAccessToken({
      refreshToken: "refresh-token",
    });

    expect(refreshed.accessToken).toBe("new-access-token");
    expect(typeof refreshed.expiryDate).toBe("number");
    expect(refreshed.expiryDate).toBeGreaterThan(Date.now());
  });

  it("maps gmail API abort to REQUEST_TIMEOUT", async () => {
    vi.mocked(fetch).mockRejectedValueOnce(
      new DOMException("Aborted", "AbortError"),
    );

    await expect(
      gmailApi("access-token", "https://gmail.googleapis.com/test"),
    ).rejects.toMatchObject({
      status: 408,
      code: "REQUEST_TIMEOUT",
    } satisfies Partial<AppError>);
  });

  it("throws when gmail API response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response);

    await expect(
      gmailApi("access-token", "https://gmail.googleapis.com/test"),
    ).rejects.toThrow("Gmail API request failed (502).");
  });

  it("returns gmail API payload on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ id: "message-1" }),
    } as unknown as Response);

    const response = await gmailApi<{ id: string }>(
      "access-token",
      "https://gmail.googleapis.com/test",
    );

    expect(response).toEqual({ id: "message-1" });
  });
});

describe("gmail sync body extraction", () => {
  const encodeBase64Url = (value: string): string =>
    Buffer.from(value, "utf8").toString("base64url");

  it("removes scripts/styles/images and strips link URLs from html bodies", () => {
    const payload = {
      mimeType: "text/html",
      body: {
        data: encodeBase64Url(`
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
        `),
      },
    };

    const body = __test__.extractBodyText(payload);

    expect(body).toContain("Hello there.");
    expect(body).toContain("Apply now");
    expect(body).not.toContain("https://example.com/apply?token=abc");
    expect(body).not.toContain("display: none");
    expect(body).not.toContain('console.log("secret")');
    expect(body).not.toContain("banner.png");
  });

  it("keeps plain text parts and combines multipart text/html payloads", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: encodeBase64Url("Plain text section") },
        },
        {
          mimeType: "text/html",
          body: { data: encodeBase64Url("<p>HTML <b>section</b></p>") },
        },
      ],
    };

    const body = __test__.extractBodyText(payload);
    const parts = body.split("\n\n");

    expect(parts[0]).toBe("Plain text section");
    expect(parts[1]).toContain("HTML section");
  });

  it("returns empty string when payload is missing", () => {
    expect(__test__.extractBodyText(undefined)).toBe("");
  });
});
