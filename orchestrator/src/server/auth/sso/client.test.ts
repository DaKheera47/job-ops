// @vitest-environment node
// openid-client hashes through WebCrypto, whose typed arrays come from another
// realm under jsdom and break oauth4webapi's base64url helper.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const OIDC_ISSUER = "https://idp.test/";
const OIDC_REDIRECT_URI = "https://jobops.example.com/sso/callback/oidc";
const GITHUB_REDIRECT_URI = "https://jobops.example.com/sso/callback/github";
const SIGNING_KEY_ID = "test-key";

const OIDC_ENV = {
  SSO_OIDC_ISSUER_URL: "https://idp.test",
  SSO_OIDC_CLIENT_ID: "oidc-client",
  SSO_OIDC_CLIENT_SECRET: "oidc-secret",
  SSO_OIDC_DISPLAY_NAME: "Pocket ID",
};

const GITHUB_ENV = {
  SSO_GITHUB_CLIENT_ID: "github-client",
  SSO_GITHUB_CLIENT_SECRET: "github-secret",
};

type FetchCall = { url: string; init: RequestInit | undefined };

function oidcMetadata(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    issuer: OIDC_ISSUER,
    authorization_endpoint: "https://idp.test/authorize",
    token_endpoint: "https://idp.test/token",
    userinfo_endpoint: "https://idp.test/userinfo",
    jwks_uri: "https://idp.test/jwks",
    response_types_supported: ["code"],
    id_token_signing_alg_values_supported: ["ES256"],
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function createIdTokenSigner(): Promise<{
  jwks: { keys: Record<string, unknown>[] };
  sign: (claims: Record<string, unknown>) => Promise<string>;
}> {
  const { privateKey, publicKey } = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", publicKey);

  return {
    jwks: { keys: [{ kty, crv, x, y, kid: SIGNING_KEY_ID, alg: "ES256" }] },
    sign: async (claims) => {
      const signingInput = `${encodeSegment({
        alg: "ES256",
        kid: SIGNING_KEY_ID,
        typ: "JWT",
      })}.${encodeSegment(claims)}`;
      const signature = await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        privateKey,
        new TextEncoder().encode(signingInput),
      );
      return `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
    },
  };
}

function idTokenClaims(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return {
    iss: OIDC_ISSUER,
    aud: OIDC_ENV.SSO_OIDC_CLIENT_ID,
    sub: "oidc-subject",
    iat: issuedAt,
    exp: issuedAt + 300,
    email: "person@example.com",
    email_verified: true,
    name: "Test Person",
    preferred_username: "person",
    ...overrides,
  };
}

describe("SSO openid-client integration", () => {
  const originalEnv = { ...process.env };
  const calls: FetchCall[] = [];
  let routes: Map<string, () => Response>;

  beforeEach(() => {
    calls.length = 0;
    routes = new Map();
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | string, init?: RequestInit) => {
        const url = String(input);
        calls.push({ url, init });
        const route = routes.get(url);
        if (!route) throw new Error(`unexpected fetch for ${url}`);
        return route();
      }),
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  async function importSsoClient() {
    return await import("./client");
  }

  function route(url: string, respond: () => Response): void {
    routes.set(url, respond);
  }

  function tokenRequest(): { body: URLSearchParams; headers: HeadersInit } {
    const call = calls.find((entry) => entry.url.includes("token"));
    if (!call?.init) throw new Error("no token request was made");
    return {
      body: new URLSearchParams(String(call.init.body)),
      headers: call.init.headers ?? {},
    };
  }

  it("builds an authorization URL from the discovered metadata", async () => {
    process.env = { ...originalEnv, ...OIDC_ENV };
    route("https://idp.test/.well-known/openid-configuration", () =>
      jsonResponse(oidcMetadata()),
    );
    const { createSsoAuthorizationRequest } = await importSsoClient();

    const request = await createSsoAuthorizationRequest({
      provider: "oidc",
      redirectUri: OIDC_REDIRECT_URI,
    });

    const url = new URL(request.authorizationUrl);
    expect(url.origin + url.pathname).toBe("https://idp.test/authorize");
    expect(url.searchParams.get("client_id")).toBe("oidc-client");
    expect(url.searchParams.get("redirect_uri")).toBe(OIDC_REDIRECT_URI);
    expect(url.searchParams.get("scope")).toBe("openid profile email");
    expect(url.searchParams.get("state")).toBe(request.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBeTruthy();
    expect(url.searchParams.get("nonce")).toBe(request.nonce);
  });

  it("reports unusable metadata as a provider misconfiguration", async () => {
    process.env = { ...originalEnv, ...OIDC_ENV };
    route("https://idp.test/.well-known/openid-configuration", () =>
      jsonResponse(oidcMetadata({ authorization_endpoint: undefined })),
    );
    const { createSsoAuthorizationRequest } = await importSsoClient();

    await expect(
      createSsoAuthorizationRequest({
        provider: "oidc",
        redirectUri: OIDC_REDIRECT_URI,
      }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("Pocket ID is misconfigured"),
    });
  });

  it("reports a failed discovery without caching it", async () => {
    process.env = { ...originalEnv, ...OIDC_ENV };
    let attempts = 0;
    route("https://idp.test/.well-known/openid-configuration", () => {
      attempts += 1;
      return attempts === 1
        ? jsonResponse({ error: "nope" }, 500)
        : jsonResponse(oidcMetadata());
    });
    const { createSsoAuthorizationRequest } = await importSsoClient();

    await expect(
      createSsoAuthorizationRequest({
        provider: "oidc",
        redirectUri: OIDC_REDIRECT_URI,
      }),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.stringContaining("Pocket ID discovery failed"),
    });
    await expect(
      createSsoAuthorizationRequest({
        provider: "oidc",
        redirectUri: OIDC_REDIRECT_URI,
      }),
    ).resolves.toMatchObject({ nonce: expect.any(String) });
  });

  it("reads identity claims from the ID token", async () => {
    process.env = { ...originalEnv, ...OIDC_ENV };
    const signer = await createIdTokenSigner();
    route("https://idp.test/.well-known/openid-configuration", () =>
      jsonResponse(oidcMetadata()),
    );
    route("https://idp.test/jwks", () => jsonResponse(signer.jwks));
    const { createSsoAuthorizationRequest, exchangeSsoAuthorizationCode } =
      await importSsoClient();

    const request = await createSsoAuthorizationRequest({
      provider: "oidc",
      redirectUri: OIDC_REDIRECT_URI,
    });
    const idToken = await signer.sign(
      idTokenClaims({ nonce: request.nonce ?? undefined }),
    );
    route("https://idp.test/token", () =>
      jsonResponse({
        access_token: "oidc-access-token",
        token_type: "bearer",
        id_token: idToken,
      }),
    );

    const claims = await exchangeSsoAuthorizationCode({
      provider: "oidc",
      redirectUri: OIDC_REDIRECT_URI,
      // RFC 9207 issuer identification travels in the callback query string.
      callbackSearch: `?code=authorization-code&state=${request.state}&iss=${encodeURIComponent(OIDC_ISSUER)}`,
      expectedState: request.state,
      codeVerifier: request.codeVerifier,
      nonce: request.nonce,
    });

    expect(claims).toEqual({
      issuer: OIDC_ISSUER,
      subject: "oidc-subject",
      email: "person@example.com",
      emailVerified: true,
      displayName: "Test Person",
      preferredUsername: "person",
    });
    const token = tokenRequest();
    expect(token.body.get("code")).toBe("authorization-code");
    expect(token.body.get("code_verifier")).toBe(request.codeVerifier);
    expect(token.body.get("client_secret")).toBe("oidc-secret");
  });

  it("falls back to userinfo when the ID token carries no email", async () => {
    process.env = { ...originalEnv, ...OIDC_ENV };
    const signer = await createIdTokenSigner();
    route("https://idp.test/.well-known/openid-configuration", () =>
      jsonResponse(oidcMetadata()),
    );
    route("https://idp.test/jwks", () => jsonResponse(signer.jwks));
    route("https://idp.test/userinfo", () =>
      jsonResponse({
        sub: "oidc-subject",
        email: "person@example.com",
        email_verified: true,
        preferred_username: "person",
      }),
    );
    const { createSsoAuthorizationRequest, exchangeSsoAuthorizationCode } =
      await importSsoClient();

    const request = await createSsoAuthorizationRequest({
      provider: "oidc",
      redirectUri: OIDC_REDIRECT_URI,
    });
    const idToken = await signer.sign(
      idTokenClaims({
        nonce: request.nonce ?? undefined,
        email: undefined,
        email_verified: undefined,
        preferred_username: undefined,
      }),
    );
    route("https://idp.test/token", () =>
      jsonResponse({
        access_token: "oidc-access-token",
        token_type: "bearer",
        id_token: idToken,
      }),
    );

    const claims = await exchangeSsoAuthorizationCode({
      provider: "oidc",
      redirectUri: OIDC_REDIRECT_URI,
      callbackSearch: `?code=authorization-code&state=${request.state}`,
      expectedState: request.state,
      codeVerifier: request.codeVerifier,
      nonce: request.nonce,
    });

    expect(claims).toMatchObject({
      email: "person@example.com",
      emailVerified: true,
      displayName: "Test Person",
      preferredUsername: "person",
    });
  });

  it("asks GitHub for JSON and identifies the account by its numeric id", async () => {
    process.env = { ...originalEnv, ...GITHUB_ENV };
    route("https://github.com/login/oauth/access_token", () =>
      jsonResponse({ access_token: "gho_token", token_type: "bearer" }),
    );
    route("https://api.github.com/user", () =>
      jsonResponse({ id: 4242, login: "octocat", name: "Octo Cat" }),
    );
    route("https://api.github.com/user/emails", () =>
      jsonResponse([
        { email: "spare@example.com", primary: false, verified: true },
        { email: "octocat@example.com", primary: true, verified: true },
      ]),
    );
    const { createSsoAuthorizationRequest, exchangeSsoAuthorizationCode } =
      await importSsoClient();

    const request = await createSsoAuthorizationRequest({
      provider: "github",
      redirectUri: GITHUB_REDIRECT_URI,
    });
    expect(request.nonce).toBeNull();
    expect(new URL(request.authorizationUrl).origin).toBe("https://github.com");

    const claims = await exchangeSsoAuthorizationCode({
      provider: "github",
      redirectUri: GITHUB_REDIRECT_URI,
      callbackSearch: `?code=authorization-code&state=${request.state}`,
      expectedState: request.state,
      codeVerifier: request.codeVerifier,
      nonce: null,
    });

    expect(claims).toEqual({
      issuer: "https://github.com",
      subject: "4242",
      email: "octocat@example.com",
      emailVerified: true,
      displayName: "Octo Cat",
      preferredUsername: "octocat",
    });

    const token = tokenRequest();
    expect(token.body.get("client_secret")).toBe("github-secret");
    expect(token.body.get("code_verifier")).toBe(request.codeVerifier);
    const headers = new Headers(token.headers);
    expect(headers.get("accept")).toContain("application/json");
    expect(headers.get("user-agent")).toContain("job-ops");
    expect(headers.get("content-type")).toBe(
      "application/x-www-form-urlencoded;charset=UTF-8",
    );
  });

  it("prefers a verified GitHub email and reports none when all are unverified", async () => {
    process.env = { ...originalEnv, ...GITHUB_ENV };
    route("https://github.com/login/oauth/access_token", () =>
      jsonResponse({ access_token: "gho_token", token_type: "bearer" }),
    );
    route("https://api.github.com/user", () =>
      jsonResponse({ id: 99, login: "octocat", name: null }),
    );
    let emails: unknown = [
      { email: "primary@example.com", primary: true, verified: false },
      { email: "verified@example.com", primary: false, verified: true },
    ];
    route("https://api.github.com/user/emails", () => jsonResponse(emails));
    const { createSsoAuthorizationRequest, exchangeSsoAuthorizationCode } =
      await importSsoClient();

    async function exchange() {
      const request = await createSsoAuthorizationRequest({
        provider: "github",
        redirectUri: GITHUB_REDIRECT_URI,
      });
      return await exchangeSsoAuthorizationCode({
        provider: "github",
        redirectUri: GITHUB_REDIRECT_URI,
        callbackSearch: `?code=authorization-code&state=${request.state}`,
        expectedState: request.state,
        codeVerifier: request.codeVerifier,
        nonce: null,
      });
    }

    expect(await exchange()).toMatchObject({
      email: "verified@example.com",
      emailVerified: true,
      displayName: null,
    });

    emails = [{ email: "primary@example.com", primary: true, verified: false }];
    expect(await exchange()).toMatchObject({
      email: null,
      emailVerified: false,
    });
  });

  it("surfaces a GitHub API failure as an upstream error", async () => {
    process.env = { ...originalEnv, ...GITHUB_ENV };
    route("https://github.com/login/oauth/access_token", () =>
      jsonResponse({ access_token: "gho_token", token_type: "bearer" }),
    );
    route("https://api.github.com/user", () =>
      jsonResponse({ message: "Bad credentials" }, 401),
    );
    const { createSsoAuthorizationRequest, exchangeSsoAuthorizationCode } =
      await importSsoClient();

    const request = await createSsoAuthorizationRequest({
      provider: "github",
      redirectUri: GITHUB_REDIRECT_URI,
    });

    await expect(
      exchangeSsoAuthorizationCode({
        provider: "github",
        redirectUri: GITHUB_REDIRECT_URI,
        callbackSearch: `?code=authorization-code&state=${request.state}`,
        expectedState: request.state,
        codeVerifier: request.codeVerifier,
        nonce: null,
      }),
    ).rejects.toMatchObject({
      status: 502,
      message: "GitHub request failed with HTTP 401",
    });
  });
});
