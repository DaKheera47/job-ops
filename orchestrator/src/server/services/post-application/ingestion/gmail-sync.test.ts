import type { AppError } from "@infra/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gmailApi, resolveGmailAccessToken } from "./gmail-sync";

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
