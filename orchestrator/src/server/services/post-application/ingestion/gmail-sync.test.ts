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

  it("uses text/plain only for multipart/alternative when plain text exceeds threshold", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: {
            data: encodeBase64Url(
              "This plain text message is definitely longer than fifty characters and should win.",
            ),
          },
        },
        {
          mimeType: "text/html",
          body: {
            data: encodeBase64Url(
              "<p>HTML version should be ignored when plain text is long enough.</p>",
            ),
          },
        },
      ],
    };

    const body = __test__.extractBodyText(payload);
    expect(body).toContain("plain text message");
    expect(body).not.toContain("HTML version should be ignored");
  });

  it("prefers plain text even when multipart/alternative plain text is short", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: encodeBase64Url("Too short") },
        },
        {
          mimeType: "text/html",
          body: {
            data: encodeBase64Url("<p>Preferred <b>HTML</b> content</p>"),
          },
        },
      ],
    };

    const body = __test__.extractBodyText(payload);
    expect(body).toContain("Too short");
    expect(body).not.toContain("Preferred HTML content");
  });

  it("deduplicates repeated text chunks across parts", () => {
    const payload = {
      mimeType: "multipart/mixed",
      parts: [
        {
          mimeType: "text/plain",
          body: { data: encodeBase64Url("Repeated sentence here.") },
        },
        {
          mimeType: "text/plain",
          body: { data: encodeBase64Url("Repeated sentence here.") },
        },
      ],
    };

    const body = __test__.extractBodyText(payload);
    expect(body).toBe("Repeated sentence here.");
  });

  it("returns empty string when payload is missing", () => {
    expect(__test__.extractBodyText(undefined)).toBe("");
  });
});

describe("gmail sync prompt assembly", () => {
  it("omits snippet from email text sent to the llm", () => {
    const emailText = __test__.buildEmailText({
      from: "jobs@example.com",
      subject: "Interview update",
      date: "Mon, 1 Jan 2026 10:00:00 +0000",
      body: "Hello from body",
    });

    expect(emailText).toContain("From: jobs@example.com");
    expect(emailText).toContain("Subject: Interview update");
    expect(emailText).toContain("Date: Mon, 1 Jan 2026 10:00:00 +0000");
    expect(emailText).toContain("Body:\nHello from body");
    expect(emailText).not.toContain("Snippet:");
  });
});
