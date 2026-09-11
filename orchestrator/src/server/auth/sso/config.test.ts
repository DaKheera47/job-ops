import { logger } from "@infra/logger";
import type { Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSsoProviderConfig,
  listEnabledSsoProviders,
  resolveSsoBaseUrl,
} from "./config";

describe("SSO provider config", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function fakeRequest(input: { protocol?: string; host?: string }): Request {
    return {
      protocol: input.protocol ?? "",
      app: { get: () => false },
      header: (name: string) =>
        name.toLowerCase() === "host" ? input.host : undefined,
    } as unknown as Request;
  }

  it("enables a provider only once its client id is configured", () => {
    expect(listEnabledSsoProviders({})).toEqual([]);

    expect(
      listEnabledSsoProviders({
        SSO_GOOGLE_CLIENT_ID: "google-client",
        SSO_GITHUB_CLIENT_ID: "github-client",
      }),
    ).toEqual([
      { id: "google", displayName: "Google" },
      { id: "github", displayName: "GitHub" },
    ]);
  });

  it("requires both an issuer and a client id for the generic provider", () => {
    expect(
      listEnabledSsoProviders({ SSO_OIDC_CLIENT_ID: "oidc-client" }),
    ).toEqual([]);

    expect(
      listEnabledSsoProviders({
        SSO_OIDC_CLIENT_ID: "oidc-client",
        SSO_OIDC_ISSUER_URL: "https://id.example.com",
        SSO_OIDC_DISPLAY_NAME: "Pocket ID",
      }),
    ).toEqual([{ id: "oidc", displayName: "Pocket ID" }]);
  });

  it("treats a missing OIDC secret as a PKCE public client", () => {
    const config = getSsoProviderConfig("oidc", {
      SSO_OIDC_CLIENT_ID: "oidc-client",
      SSO_OIDC_ISSUER_URL: "https://id.example.com",
    });

    expect(config).toMatchObject({
      clientSecret: null,
      scopes: "openid profile email",
      allowInsecureHttp: false,
    });
  });

  it("falls back to the default and warns once for an unparseable boolean flag", () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const env = {
      SSO_OIDC_CLIENT_ID: "oidc-client",
      SSO_OIDC_ISSUER_URL: "https://id.example.com",
      SSO_OIDC_ALLOW_INSECURE_HTTP: "maybe",
    };

    const config = getSsoProviderConfig("oidc", env);
    getSsoProviderConfig("oidc", env);

    expect(config?.allowInsecureHttp).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      "Ignoring unparseable SSO boolean flag",
      expect.objectContaining({ key: "SSO_OIDC_ALLOW_INSECURE_HTTP" }),
    );
  });

  it("accepts the documented boolean spellings", () => {
    for (const value of ["1", "true", "YES", "on"]) {
      expect(
        getSsoProviderConfig("oidc", {
          SSO_OIDC_CLIENT_ID: "oidc-client",
          SSO_OIDC_ISSUER_URL: "https://id.example.com",
          SSO_OIDC_ALLOW_SIGNUP: value,
        })?.allowSignup,
      ).toBe(true);
    }

    for (const value of ["0", "false", "no", "off", ""]) {
      expect(
        getSsoProviderConfig("oidc", {
          SSO_OIDC_CLIENT_ID: "oidc-client",
          SSO_OIDC_ISSUER_URL: "https://id.example.com",
          SSO_OIDC_ALLOW_SIGNUP: value,
        })?.allowSignup,
      ).toBe(false);
    }
  });

  it("keeps signup disabled for public providers without an email allowlist", () => {
    vi.spyOn(logger, "warn").mockImplementation(() => {});

    expect(
      getSsoProviderConfig("google", {
        SSO_GOOGLE_CLIENT_ID: "google-client",
        SSO_GOOGLE_ALLOW_SIGNUP: "true",
      })?.allowSignup,
    ).toBe(false);

    expect(
      getSsoProviderConfig("google", {
        SSO_GOOGLE_CLIENT_ID: "google-client",
        SSO_GOOGLE_ALLOW_SIGNUP: "true",
        SSO_GOOGLE_ALLOWED_EMAIL_DOMAINS: " Example.com , acme.test ",
      }),
    ).toMatchObject({
      allowSignup: true,
      allowedEmailDomains: ["example.com", "acme.test"],
    });
  });

  it("lets the generic provider enable signup without an email allowlist", () => {
    expect(
      getSsoProviderConfig("oidc", {
        SSO_OIDC_CLIENT_ID: "oidc-client",
        SSO_OIDC_ISSUER_URL: "https://id.example.com",
        SSO_OIDC_ALLOW_SIGNUP: "true",
      }),
    ).toMatchObject({ allowSignup: true, allowedEmailDomains: [] });
  });

  it("prefers the SSO redirect base URL over the public base URL and origin", () => {
    process.env.SSO_REDIRECT_BASE_URL = "https://sso.example.com/";
    process.env.JOBOPS_PUBLIC_BASE_URL = "https://public.example.com";

    expect(
      resolveSsoBaseUrl(fakeRequest({ protocol: "http", host: "localhost" })),
    ).toBe("https://sso.example.com");
  });

  it("falls back to the public base URL and then to the request origin", () => {
    process.env.SSO_REDIRECT_BASE_URL = "";
    process.env.JOBOPS_PUBLIC_BASE_URL = "https://public.example.com/";
    expect(
      resolveSsoBaseUrl(fakeRequest({ protocol: "http", host: "localhost" })),
    ).toBe("https://public.example.com");

    process.env.JOBOPS_PUBLIC_BASE_URL = "";
    expect(
      resolveSsoBaseUrl(
        fakeRequest({ protocol: "http", host: "localhost:3000" }),
      ),
    ).toBe("http://localhost:3000");
  });

  it("returns null when no base URL can be derived", () => {
    process.env.SSO_REDIRECT_BASE_URL = "";
    process.env.JOBOPS_PUBLIC_BASE_URL = "";

    expect(resolveSsoBaseUrl(fakeRequest({}))).toBeNull();
  });
});
