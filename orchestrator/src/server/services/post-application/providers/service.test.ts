import type { PostApplicationIntegration } from "@shared/types";
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@server/repositories/post-application-integrations", () => ({
  getPostApplicationIntegration: vi.fn().mockResolvedValue(null),
  upsertConnectedPostApplicationIntegration: vi.fn().mockImplementation(
    async ({
      provider,
      accountKey,
      displayName,
      credentials,
    }: {
      provider: "gmail";
      accountKey: string;
      displayName: string;
      credentials: Record<string, unknown>;
    }) =>
      ({
        id: "integration-test",
        provider,
        accountKey,
        displayName,
        status: "connected",
        credentials,
        lastConnectedAt: Date.now(),
        lastSyncedAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }) satisfies PostApplicationIntegration,
  ),
  disconnectPostApplicationIntegration: vi.fn().mockImplementation(
    async (provider: "gmail", accountKey: string) =>
      ({
        id: "integration-test",
        provider,
        accountKey,
        displayName: "Gmail (default)",
        status: "disconnected",
        credentials: null,
        lastConnectedAt: Date.now(),
        lastSyncedAt: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }) satisfies PostApplicationIntegration,
  ),
}));

const integrationRepo = await import(
  "@server/repositories/post-application-integrations"
);

import {
  PostApplicationProviderError,
  providerUpstreamError,
  toProviderAppError,
} from "./errors";
import {
  listPostApplicationProviders,
  resolvePostApplicationProvider,
} from "./registry";
import { executePostApplicationProviderAction } from "./service";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("post-application provider registry", () => {
  it("lists registered providers", () => {
    expect(listPostApplicationProviders()).toEqual(["gmail", "imap"]);
  });

  it("resolves a known provider", () => {
    const provider = resolvePostApplicationProvider("gmail");
    expect(provider.key).toBe("gmail");
  });

  it("throws explicit invalid-request error for unknown provider", () => {
    expect(() => resolvePostApplicationProvider("exchange")).toThrowError(
      PostApplicationProviderError,
    );

    try {
      resolvePostApplicationProvider("exchange");
      throw new Error("expected resolve to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(PostApplicationProviderError);
      expect((error as PostApplicationProviderError).kind).toBe(
        "invalid_request",
      );
    }
  });
});

describe("post-application provider action dispatcher", () => {
  it("connects gmail and persists credentials in the integrations store", async () => {
    const response = await executePostApplicationProviderAction({
      provider: "gmail",
      action: "connect",
      accountKey: "account:gmail:test",
      connectPayload: {
        payload: {
          refreshToken: "refresh-token",
          accessToken: "access-token",
          email: "candidate@example.com",
          scope: "https://www.googleapis.com/auth/gmail.readonly",
        },
      },
    });

    expect(
      integrationRepo.upsertConnectedPostApplicationIntegration,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "gmail",
        accountKey: "account:gmail:test",
      }),
    );
    expect(response.status.connected).toBe(true);
    expect(response.message).toBe("Gmail integration connected.");
    expect(response.status.integration?.credentials).toEqual(
      expect.objectContaining({
        hasRefreshToken: true,
        hasAccessToken: true,
        email: "candidate@example.com",
      }),
    );
  });

  it("dispatches status action to gmail provider", async () => {
    const response = await executePostApplicationProviderAction({
      provider: "gmail",
      action: "status",
      accountKey: "account:gmail:test",
    });

    expect(response).toEqual({
      provider: "gmail",
      action: "status",
      accountKey: "account:gmail:test",
      status: {
        provider: "gmail",
        accountKey: "account:gmail:test",
        connected: false,
        integration: null,
      },
      message: "Gmail provider is not connected.",
    });
  });

  it("disconnects gmail and clears credentials from integration store", async () => {
    const getIntegrationMock =
      integrationRepo.getPostApplicationIntegration as Mock;
    getIntegrationMock.mockResolvedValueOnce({
      id: "integration-test",
      provider: "gmail",
      accountKey: "account:gmail:test",
      displayName: "Gmail (default)",
      status: "connected",
      credentials: {
        refreshToken: "refresh-token",
      },
      lastConnectedAt: Date.now(),
      lastSyncedAt: null,
      lastError: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } satisfies PostApplicationIntegration);

    const response = await executePostApplicationProviderAction({
      provider: "gmail",
      action: "disconnect",
      accountKey: "account:gmail:test",
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(
      integrationRepo.disconnectPostApplicationIntegration,
    ).toHaveBeenCalledWith("gmail", "account:gmail:test");
    expect(response.status.connected).toBe(false);
    expect(response.message).toBe("Gmail integration disconnected.");
    expect(response.status.integration?.credentials).toEqual(
      expect.objectContaining({
        hasRefreshToken: false,
        hasAccessToken: false,
      }),
    );
  });

  it("returns invalid request when gmail connect payload is missing refresh token", async () => {
    await expect(
      executePostApplicationProviderAction({
        provider: "gmail",
        action: "connect",
        accountKey: "account:gmail:test",
        connectPayload: { payload: {} },
      }),
    ).rejects.toMatchObject({
      status: 400,
      code: "INVALID_REQUEST",
    });
  });

  it("maps IMAP not-implemented errors to service unavailable app errors", async () => {
    await expect(
      executePostApplicationProviderAction({
        provider: "imap",
        action: "connect",
        accountKey: "account:imap:test",
      }),
    ).rejects.toMatchObject({
      status: 503,
      code: "SERVICE_UNAVAILABLE",
      message:
        "IMAP provider is not implemented yet for account 'account:imap:test'.",
    });
  });

  it("maps upstream provider errors to upstream app errors", () => {
    const appError = toProviderAppError(
      providerUpstreamError("Provider API timed out"),
    );

    expect(appError.status).toBe(502);
    expect(appError.code).toBe("UPSTREAM_ERROR");
    expect(appError.message).toBe("Provider API timed out");
  });
});
