import { describe, expect, it } from "vitest";
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
