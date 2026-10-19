import type { Server } from "node:http";
import { request as httpRequest } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

const ssoClientMocks = vi.hoisted(() => ({
  createSsoAuthorizationRequest: vi.fn(),
  exchangeSsoAuthorizationCode: vi.fn(),
}));

vi.mock("@server/auth/sso/client", () => ({
  createSsoAuthorizationRequest: ssoClientMocks.createSsoAuthorizationRequest,
  exchangeSsoAuthorizationCode: ssoClientMocks.exchangeSsoAuthorizationCode,
}));

type SsoClaims = {
  issuer: string;
  subject: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
  preferredUsername: string | null;
};

const AUTH_ENV = {
  BASIC_AUTH_USER: "admin",
  BASIC_AUTH_PASSWORD: "secret",
  JWT_SECRET: "an-explicit-jwt-secret-with-at-least-32-chars",
  JOBOPS_TEST_AUTH_BYPASS: "0",
};

const SSO_ENV = {
  SSO_GOOGLE_CLIENT_ID: "google-client",
  SSO_GOOGLE_CLIENT_SECRET: "google-secret",
  SSO_GITHUB_CLIENT_ID: "github-client",
  SSO_GITHUB_CLIENT_SECRET: "github-secret",
  SSO_OIDC_ISSUER_URL: "https://idp.test",
  SSO_OIDC_CLIENT_ID: "oidc-client",
  SSO_OIDC_CLIENT_SECRET: "oidc-secret",
  SSO_OIDC_DISPLAY_NAME: "Pocket ID",
};

const OIDC_ISSUER = "https://idp.test";
const GOOGLE_ISSUER = "https://accounts.google.com";
const CALLBACK_SEARCH = "?code=authorization-code&state=stored-state";

describe.sequential("SSO auth routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;
  let issuedStates = 0;

  beforeEach(() => {
    issuedStates = 0;
    ssoClientMocks.createSsoAuthorizationRequest.mockImplementation(
      async (input: { provider: string; redirectUri: string }) => {
        issuedStates += 1;
        return {
          authorizationUrl: `https://idp.test/authorize?client_id=${input.provider}&state=state-${issuedStates}`,
          state: `state-${issuedStates}`,
          codeVerifier: `verifier-${issuedStates}`,
          nonce: input.provider === "github" ? null : `nonce-${issuedStates}`,
        };
      },
    );
    ssoClientMocks.exchangeSsoAuthorizationCode.mockResolvedValue(
      buildClaims(),
    );
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  function buildClaims(overrides: Partial<SsoClaims> = {}): SsoClaims {
    return {
      issuer: OIDC_ISSUER,
      subject: "subject-1",
      email: "person@example.com",
      emailVerified: true,
      displayName: "Test Person",
      preferredUsername: "person",
      ...overrides,
    };
  }

  async function startSsoServer(
    env: Record<string, string | undefined> = {},
  ): Promise<void> {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: { ...AUTH_ENV, ...SSO_ENV, ...env },
    }));
  }

  async function postJson(
    path: string,
    body?: unknown,
    token?: string,
  ): Promise<Response> {
    return fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  async function login(username: string, password: string): Promise<string> {
    const res = await postJson("/api/auth/login", { username, password });
    expect(res.status).toBe(200);
    const body = await res.json();
    return body.data.token as string;
  }

  async function startFlow(input: {
    provider: string;
    mode?: "login" | "link";
    token?: string;
  }): Promise<{ state: string; flowToken: string }> {
    const suffix = input.mode === "link" ? "link/start" : "start";
    const res = await postJson(
      `/api/auth/sso/${input.provider}/${suffix}`,
      undefined,
      input.token,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    return {
      state: body.data.state as string,
      flowToken: body.data.flowToken as string,
    };
  }

  async function postCallback(input: {
    provider: string;
    mode?: "login" | "link";
    state: string;
    flowToken: string;
    token?: string;
  }): Promise<Response> {
    const suffix = input.mode === "link" ? "link/callback" : "callback";
    return postJson(
      `/api/auth/sso/${input.provider}/${suffix}`,
      {
        state: input.state,
        flowToken: input.flowToken,
        callbackSearch: CALLBACK_SEARCH,
      },
      input.token,
    );
  }

  async function signInWithSso(input: {
    provider: string;
    claims: SsoClaims;
  }): Promise<Response> {
    const flow = await startFlow({ provider: input.provider });
    ssoClientMocks.exchangeSsoAuthorizationCode.mockResolvedValue(input.claims);
    return postCallback({ provider: input.provider, ...flow });
  }

  /**
   * The origin the redirect URI is built from comes from the Host header, which
   * `fetch` always sends. An empty one still parses, whereas dropping the header
   * outright makes Node answer 400 before the request reaches the app.
   */
  async function postWithEmptyHostHeader(path: string): Promise<number> {
    const url = new URL(baseUrl);
    return new Promise<number>((resolve, reject) => {
      const req = httpRequest(
        {
          host: url.hostname,
          port: Number(url.port),
          path,
          method: "POST",
          setHost: false,
          headers: { host: "" },
        },
        (res) => {
          res.resume();
          res.on("end", () => resolve(res.statusCode ?? 0));
        },
      );
      req.on("error", reject);
      req.end();
    });
  }

  describe("GET /api/auth/sso/providers", () => {
    it("lists enabled providers without their signup policy", async () => {
      await startSsoServer();

      const res = await fetch(`${baseUrl}/api/auth/sso/providers`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data).toEqual([
        { id: "google", displayName: "Google" },
        { id: "github", displayName: "GitHub" },
        { id: "oidc", displayName: "Pocket ID" },
      ]);
    });
  });

  describe("POST /api/auth/sso/:provider/start", () => {
    it("returns an authorization url, state and flow token", async () => {
      await startSsoServer();

      const res = await postJson("/api/auth/sso/oidc/start");

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data).toMatchObject({
        provider: "oidc",
        state: "state-1",
      });
      expect(body.data.authorizationUrl).toContain(
        "https://idp.test/authorize",
      );
      expect(body.data.flowToken).toBeTruthy();
      expect(ssoClientMocks.createSsoAuthorizationRequest).toHaveBeenCalledWith(
        {
          provider: "oidc",
          redirectUri: `${baseUrl}/sso/callback/oidc`,
        },
      );
    });

    it("returns 404 for a provider that is not configured", async () => {
      await startSsoServer({
        SSO_GOOGLE_CLIENT_ID: "",
        SSO_GOOGLE_CLIENT_SECRET: "",
      });

      const res = await postJson("/api/auth/sso/google/start");

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("is disabled in demo mode", async () => {
      await startSsoServer({ DEMO_MODE: "true" });

      const res = await postJson("/api/auth/sso/oidc/start");

      expect(res.status).toBe(503);
    });

    it("requires initial setup before the first account exists", async () => {
      await startSsoServer({
        BASIC_AUTH_USER: "",
        BASIC_AUTH_PASSWORD: "",
      });

      const res = await postJson("/api/auth/sso/oidc/start");

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.message).toBe("Initial setup is required");
    });

    it("returns 503 when no public base URL can be derived", async () => {
      await startSsoServer({ JOBOPS_PUBLIC_BASE_URL: "" });

      await expect(
        postWithEmptyHostHeader("/api/auth/sso/oidc/start"),
      ).resolves.toBe(503);
    });
  });

  describe("POST /api/auth/sso/:provider/callback", () => {
    it("rejects an unknown identity while signup is disabled", async () => {
      await startSsoServer();

      const res = await signInWithSso({
        provider: "oidc",
        claims: buildClaims(),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.message).toContain("Pocket ID");
    });

    it("provisions a password-less account for an allowed email domain", async () => {
      await startSsoServer({
        SSO_GOOGLE_ALLOW_SIGNUP: "true",
        SSO_GOOGLE_ALLOWED_EMAIL_DOMAINS: "example.com",
      });

      const res = await signInWithSso({
        provider: "google",
        claims: buildClaims({
          issuer: GOOGLE_ISSUER,
          subject: "google-1",
          email: "newbie@example.com",
          preferredUsername: "newbie",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.created).toBe(true);
      expect(body.data.token).toBeTruthy();
      expect(body.data.user).toMatchObject({
        username: "newbie",
        hasPassword: false,
        isSystemAdmin: false,
      });

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${body.data.token}` },
      });
      expect(meRes.status).toBe(200);
      const meBody = await meRes.json();
      expect(meBody.data.user.id).toBe(body.data.user.id);

      const loginRes = await postJson("/api/auth/login", {
        username: "newbie",
        password: "not-a-real-password",
      });
      expect(loginRes.status).toBe(401);
    });

    it("rejects an unverified email", async () => {
      await startSsoServer({
        SSO_GOOGLE_ALLOW_SIGNUP: "true",
        SSO_GOOGLE_ALLOWED_EMAIL_DOMAINS: "example.com",
      });

      const res = await signInWithSso({
        provider: "google",
        claims: buildClaims({
          issuer: GOOGLE_ISSUER,
          subject: "google-2",
          email: "newbie@example.com",
          emailVerified: false,
        }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects an email outside the allowed domains", async () => {
      await startSsoServer({
        SSO_GOOGLE_ALLOW_SIGNUP: "true",
        SSO_GOOGLE_ALLOWED_EMAIL_DOMAINS: "example.com",
      });

      const res = await signInWithSso({
        provider: "google",
        claims: buildClaims({
          issuer: GOOGLE_ISSUER,
          subject: "google-3",
          email: "stranger@evil.test",
        }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects an email whose allowed domain is not the mail domain", async () => {
      await startSsoServer({
        SSO_GOOGLE_ALLOW_SIGNUP: "true",
        SSO_GOOGLE_ALLOWED_EMAIL_DOMAINS: "example.com",
      });

      const res = await signInWithSso({
        provider: "google",
        claims: buildClaims({
          issuer: GOOGLE_ISSUER,
          subject: "google-3b",
          email: "newbie@example.com@evil.test",
        }),
      });

      expect(res.status).toBe(403);
    });

    it("rejects a replayed state", async () => {
      await startSsoServer({
        SSO_GOOGLE_ALLOW_SIGNUP: "true",
        SSO_GOOGLE_ALLOWED_EMAIL_DOMAINS: "example.com",
      });
      const claims = buildClaims({
        issuer: GOOGLE_ISSUER,
        subject: "google-4",
        email: "replay@example.com",
      });
      const flow = await startFlow({ provider: "google" });
      ssoClientMocks.exchangeSsoAuthorizationCode.mockResolvedValue(claims);

      const first = await postCallback({ provider: "google", ...flow });
      expect(first.status).toBe(200);

      const replay = await postCallback({ provider: "google", ...flow });
      expect(replay.status).toBe(400);
      const body = await replay.json();
      expect(body.error.message).toBe("SSO session expired, try again");
    });

    it("rejects a mismatched flow token without issuing a session", async () => {
      await startSsoServer({
        SSO_GOOGLE_ALLOW_SIGNUP: "true",
        SSO_GOOGLE_ALLOWED_EMAIL_DOMAINS: "example.com",
      });
      const flow = await startFlow({ provider: "google" });

      const res = await postCallback({
        provider: "google",
        state: flow.state,
        flowToken: "a-different-flow-token",
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.data).toBeUndefined();
      expect(
        ssoClientMocks.exchangeSsoAuthorizationCode,
      ).not.toHaveBeenCalled();
    });

    it("rejects a state issued for another provider", async () => {
      await startSsoServer();
      const flow = await startFlow({ provider: "google" });

      const res = await postCallback({ provider: "github", ...flow });

      expect(res.status).toBe(400);
      expect(
        ssoClientMocks.exchangeSsoAuthorizationCode,
      ).not.toHaveBeenCalled();
    });

    it("rejects a disabled user", async () => {
      await startSsoServer();
      const usersRepo = await import("@server/repositories/users");
      const identitiesRepo = await import(
        "@server/repositories/sso-identities"
      );
      const user = await usersRepo.createPrivateWorkspaceUser({
        username: "blocked",
        password: "blocked-password",
      });
      await identitiesRepo.createSsoIdentity({
        tenantId: user.workspaceId,
        userId: user.id,
        provider: "oidc",
        issuer: OIDC_ISSUER,
        subject: "blocked-subject",
        email: null,
        displayName: null,
      });
      await usersRepo.setUserDisabled(user.id, true);

      const res = await signInWithSso({
        provider: "oidc",
        claims: buildClaims({ subject: "blocked-subject" }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("hosted mode provisioning", () => {
    const HOSTED_ENV = {
      BASIC_AUTH_USER: "",
      BASIC_AUTH_PASSWORD: "",
      JOBOPS_APP_MODE: "hosted",
      JOBOPS_HOSTED_TENANT_ID: "tenant_default",
      SSO_OIDC_ALLOW_SIGNUP: "true",
    };

    it("provisions into the hosted tenant when signups are enabled", async () => {
      await startSsoServer({
        ...HOSTED_ENV,
        JOBOPS_HOSTED_SIGNUPS_ENABLED: "true",
      });

      const res = await signInWithSso({
        provider: "oidc",
        claims: buildClaims({
          subject: "hosted-1",
          email: "hosted@example.com",
          preferredUsername: "hosted",
        }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.created).toBe(true);
      expect(body.data.user).toMatchObject({
        username: "hosted",
        workspaceId: "tenant_default",
        isSystemAdmin: false,
        hasPassword: false,
      });
    });

    it("rejects provisioning when hosted signups are disabled", async () => {
      await startSsoServer(HOSTED_ENV);

      const res = await signInWithSso({
        provider: "oidc",
        claims: buildClaims({ subject: "hosted-2" }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error.message).toContain("Hosted signups are disabled");
    });

    it("rejects a linked identity whose user is outside the hosted tenant", async () => {
      await startSsoServer({
        ...HOSTED_ENV,
        JOBOPS_HOSTED_TENANT_ID: "tenant_hosted",
      });
      const usersRepo = await import("@server/repositories/users");
      const identitiesRepo = await import(
        "@server/repositories/sso-identities"
      );
      const user = await usersRepo.createPrivateWorkspaceUser({
        username: "outsider",
        password: "outsider-password",
      });
      await identitiesRepo.createSsoIdentity({
        tenantId: user.workspaceId,
        userId: user.id,
        provider: "oidc",
        issuer: OIDC_ISSUER,
        subject: "outsider-subject",
        email: null,
        displayName: null,
      });

      const res = await signInWithSso({
        provider: "oidc",
        claims: buildClaims({ subject: "outsider-subject" }),
      });

      expect(res.status).toBe(401);
    });
  });

  describe("account linking", () => {
    it("links a provider to the signed-in user and then signs in with it", async () => {
      await startSsoServer();
      const token = await login("admin", "secret");
      const claims = buildClaims({ subject: "admin-subject" });

      const linkFlow = await startFlow({
        provider: "oidc",
        mode: "link",
        token,
      });
      ssoClientMocks.exchangeSsoAuthorizationCode.mockResolvedValue(claims);
      const linkRes = await postCallback({
        provider: "oidc",
        mode: "link",
        token,
        ...linkFlow,
      });

      expect(linkRes.status).toBe(201);
      const linkBody = await linkRes.json();
      expect(linkBody.data).toMatchObject({
        provider: "oidc",
        email: "person@example.com",
        displayName: "Test Person",
      });

      const loginRes = await signInWithSso({ provider: "oidc", claims });
      expect(loginRes.status).toBe(200);
      const loginBody = await loginRes.json();
      expect(loginBody.data.created).toBe(false);

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${loginBody.data.token}` },
      });
      expect(meRes.status).toBe(200);
      const meBody = await meRes.json();
      expect(meBody.data.user.username).toBe("admin");
    });

    it("returns the existing identity when the same account is linked twice", async () => {
      await startSsoServer();
      const token = await login("admin", "secret");
      const claims = buildClaims({ subject: "admin-subject" });

      for (const expectedStatus of [201, 200]) {
        const flow = await startFlow({ provider: "oidc", mode: "link", token });
        ssoClientMocks.exchangeSsoAuthorizationCode.mockResolvedValue(claims);
        const res = await postCallback({
          provider: "oidc",
          mode: "link",
          token,
          ...flow,
        });
        expect(res.status).toBe(expectedStatus);
      }
    });

    it("returns 409 when the identity belongs to another user", async () => {
      await startSsoServer();
      const usersRepo = await import("@server/repositories/users");
      const identitiesRepo = await import(
        "@server/repositories/sso-identities"
      );
      const other = await usersRepo.createPrivateWorkspaceUser({
        username: "other",
        password: "other-password",
      });
      await identitiesRepo.createSsoIdentity({
        tenantId: other.workspaceId,
        userId: other.id,
        provider: "oidc",
        issuer: OIDC_ISSUER,
        subject: "shared-subject",
        email: null,
        displayName: null,
      });
      const token = await login("admin", "secret");

      const flow = await startFlow({ provider: "oidc", mode: "link", token });
      ssoClientMocks.exchangeSsoAuthorizationCode.mockResolvedValue(
        buildClaims({ subject: "shared-subject" }),
      );
      const res = await postCallback({
        provider: "oidc",
        mode: "link",
        token,
        ...flow,
      });

      expect(res.status).toBe(409);
    });

    it("rejects a link callback that belongs to a different session", async () => {
      await startSsoServer();
      const usersRepo = await import("@server/repositories/users");
      await usersRepo.createPrivateWorkspaceUser({
        username: "other",
        password: "other-password",
      });
      const adminToken = await login("admin", "secret");
      const otherToken = await login("other", "other-password");

      const flow = await startFlow({
        provider: "oidc",
        mode: "link",
        token: adminToken,
      });
      const res = await postCallback({
        provider: "oidc",
        mode: "link",
        token: otherToken,
        ...flow,
      });

      expect(res.status).toBe(400);
      expect(
        ssoClientMocks.exchangeSsoAuthorizationCode,
      ).not.toHaveBeenCalled();
    });

    it("requires a bearer token, in demo mode as well", async () => {
      await startSsoServer();

      await expect(
        postJson("/api/auth/sso/oidc/link/start").then((res) => res.status),
      ).resolves.toBe(401);
      await expect(
        fetch(`${baseUrl}/api/auth/sso/identities`).then((res) => res.status),
      ).resolves.toBe(401);

      await stopServer({ server, closeDb, tempDir });
      await startSsoServer({ DEMO_MODE: "true" });

      await expect(
        postJson("/api/auth/sso/oidc/link/start").then((res) => res.status),
      ).resolves.toBe(401);
      await expect(
        fetch(`${baseUrl}/api/auth/sso/identities`).then((res) => res.status),
      ).resolves.toBe(401);
    });
  });

  describe("connected account management", () => {
    async function listIdentities(token: string): Promise<
      {
        id: string;
        provider: string;
      }[]
    > {
      const res = await fetch(`${baseUrl}/api/auth/sso/identities`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      return body.data;
    }

    it("lists only the caller's identities and refuses to unlink another user's", async () => {
      await startSsoServer();
      const usersRepo = await import("@server/repositories/users");
      const identitiesRepo = await import(
        "@server/repositories/sso-identities"
      );
      const other = await usersRepo.createPrivateWorkspaceUser({
        username: "other",
        password: "other-password",
      });
      const otherIdentity = await identitiesRepo.createSsoIdentity({
        tenantId: other.workspaceId,
        userId: other.id,
        provider: "oidc",
        issuer: OIDC_ISSUER,
        subject: "other-subject",
        email: "other@example.com",
        displayName: null,
      });
      const token = await login("admin", "secret");

      const flow = await startFlow({ provider: "oidc", mode: "link", token });
      ssoClientMocks.exchangeSsoAuthorizationCode.mockResolvedValue(
        buildClaims({ subject: "admin-subject" }),
      );
      const linkRes = await postCallback({
        provider: "oidc",
        mode: "link",
        token,
        ...flow,
      });
      expect(linkRes.status).toBe(201);

      const identities = await listIdentities(token);
      expect(identities).toHaveLength(1);
      expect(identities[0]?.id).not.toBe(otherIdentity.id);

      const deleteRes = await fetch(
        `${baseUrl}/api/auth/sso/identities/${otherIdentity.id}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
      );
      expect(deleteRes.status).toBe(404);
      await expect(
        identitiesRepo.countSsoIdentitiesForUser(other.id),
      ).resolves.toBe(1);
    });

    it("keeps a password-less account from removing its last sign-in method", async () => {
      await startSsoServer({ SSO_OIDC_ALLOW_SIGNUP: "true" });
      const loginRes = await signInWithSso({
        provider: "oidc",
        claims: buildClaims({ subject: "sso-only", preferredUsername: "solo" }),
      });
      expect(loginRes.status).toBe(200);
      const token = (await loginRes.json()).data.token as string;

      const [identity] = await listIdentities(token);
      const unlinkPath = `/api/auth/sso/identities/${identity?.id}`;

      const blockedRes = await fetch(`${baseUrl}${unlinkPath}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(blockedRes.status).toBe(400);
      const blockedBody = await blockedRes.json();
      expect(blockedBody.error.message).toBe(
        "Set a password before removing your last sign-in method",
      );

      const passwordRes = await postJson(
        "/api/workspaces/me/password",
        { password: "a-brand-new-password" },
        token,
      );
      expect(passwordRes.status).toBe(200);

      const unlinkRes = await fetch(`${baseUrl}${unlinkPath}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(unlinkRes.status).toBe(200);
      await expect(unlinkRes.json()).resolves.toMatchObject({
        data: { deleted: true },
      });
      await expect(listIdentities(token)).resolves.toEqual([]);
    });
  });
});
