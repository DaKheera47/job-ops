import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  generateAuthenticationOptionsMock,
  generateRegistrationOptionsMock,
  verifyAuthenticationResponseMock,
  verifyRegistrationResponseMock,
} = vi.hoisted(() => ({
  generateAuthenticationOptionsMock: vi.fn(),
  generateRegistrationOptionsMock: vi.fn(),
  verifyAuthenticationResponseMock: vi.fn(),
  verifyRegistrationResponseMock: vi.fn(),
}));

vi.mock("@simplewebauthn/server", () => ({
  generateAuthenticationOptions: generateAuthenticationOptionsMock,
  generateRegistrationOptions: generateRegistrationOptionsMock,
  verifyAuthenticationResponse: verifyAuthenticationResponseMock,
  verifyRegistrationResponse: verifyRegistrationResponseMock,
}));

import { startServer, stopServer } from "./test-utils";

const AUTH_ENV = {
  BASIC_AUTH_USER: "admin",
  BASIC_AUTH_PASSWORD: "secret",
  JWT_SECRET: "an-explicit-jwt-secret-with-at-least-32-chars",
  JOBOPS_TEST_AUTH_BYPASS: "0",
  WEBAUTHN_ORIGINS: "http://localhost:5173",
};

const REGISTRATION_OPTIONS = {
  challenge: "registration-challenge",
  rp: { id: "localhost", name: "JobOps" },
  user: { id: "dXNlci1pZA", name: "admin", displayName: "admin" },
  pubKeyCredParams: [],
};

const AUTHENTICATION_OPTIONS = {
  challenge: "authentication-challenge",
  rpId: "localhost",
  userVerification: "required",
};

function credentialResponse(id: string) {
  return {
    id,
    rawId: id,
    type: "public-key",
    response: { clientDataJSON: "client-data" },
    clientExtensionResults: {},
  };
}

function verifiedRegistration(credentialId: string) {
  return {
    verified: true,
    registrationInfo: {
      credential: {
        id: credentialId,
        publicKey: new Uint8Array([1, 2, 3, 4]),
        counter: 0,
        transports: ["internal", "hybrid", "not-a-transport"],
      },
      credentialDeviceType: "multiDevice",
      credentialBackedUp: true,
      aaguid: "00000000-0000-0000-0000-000000000000",
    },
  };
}

describe.sequential("Auth passkey routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    generateRegistrationOptionsMock.mockResolvedValue(REGISTRATION_OPTIONS);
    generateAuthenticationOptionsMock.mockResolvedValue(AUTHENTICATION_OPTIONS);
    verifyRegistrationResponseMock.mockResolvedValue(
      verifiedRegistration("credential-one"),
    );
    verifyAuthenticationResponseMock.mockResolvedValue({
      verified: true,
      authenticationInfo: {
        newCounter: 7,
        credentialDeviceType: "multiDevice",
        credentialBackedUp: true,
      },
    });

    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: AUTH_ENV,
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  async function login(username: string, password: string): Promise<string> {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    return body.data.token as string;
  }

  async function requestRegistrationOptions(token: string): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/passkeys/register/options`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  async function verifyRegistration(input: {
    token: string;
    credentialId: string;
    name?: string;
  }): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/passkeys/register/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.token}`,
      },
      body: JSON.stringify({
        name: input.name,
        response: credentialResponse(input.credentialId),
      }),
    });
  }

  async function registerPasskey(input: {
    token: string;
    credentialId: string;
    name?: string;
  }) {
    const optionsRes = await requestRegistrationOptions(input.token);
    expect(optionsRes.status).toBe(200);

    verifyRegistrationResponseMock.mockResolvedValueOnce(
      verifiedRegistration(input.credentialId),
    );
    const verifyRes = await verifyRegistration(input);
    const body = await verifyRes.json();
    expect(verifyRes.status).toBe(201);
    return body.data;
  }

  async function requestLoginChallenge(): Promise<string> {
    const res = await fetch(`${baseUrl}/api/auth/passkeys/login/options`, {
      method: "POST",
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    return body.data.challengeId as string;
  }

  async function verifyLogin(input: {
    challengeId: string;
    credentialId: string;
  }): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/passkeys/login/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        challengeId: input.challengeId,
        response: credentialResponse(input.credentialId),
      }),
    });
  }

  async function createUser(input: { username: string; password: string }) {
    const usersRepo = await import("@server/repositories/users");
    return usersRepo.createPrivateWorkspaceUser({
      username: input.username,
      password: input.password,
      displayName: input.username,
    });
  }

  async function getStoredPasskey(id: string) {
    const { db, schema } = await import("@server/db");
    const [row] = await db
      .select()
      .from(schema.passkeyCredentials)
      .where(eq(schema.passkeyCredentials.id, id));
    return row ?? null;
  }

  describe("registration", () => {
    it("returns registration options and excludes existing credentials", async () => {
      const token = await login("admin", "secret");
      await registerPasskey({
        token,
        credentialId: "credential-one",
        name: "Laptop",
      });

      const res = await requestRegistrationOptions(token);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.options).toEqual(REGISTRATION_OPTIONS);
      expect(generateRegistrationOptionsMock).toHaveBeenLastCalledWith(
        expect.objectContaining({
          rpID: "localhost",
          rpName: "JobOps",
          userName: "admin",
          attestationType: "none",
          authenticatorSelection: {
            residentKey: "required",
            userVerification: "required",
          },
          excludeCredentials: [
            { id: "credential-one", transports: ["internal", "hybrid"] },
          ],
        }),
      );
    });

    it("persists a verified passkey and consumes the challenge", async () => {
      const token = await login("admin", "secret");
      const summary = await registerPasskey({
        token,
        credentialId: "credential-one",
        name: "  Laptop  ",
      });

      expect(summary).toMatchObject({
        id: "credential-one",
        name: "Laptop",
        deviceType: "multiDevice",
        backedUp: true,
        transports: ["internal", "hybrid", "not-a-transport"],
        lastUsedAt: null,
      });
      await expect(getStoredPasskey("credential-one")).resolves.toMatchObject({
        userId: expect.any(String),
        tenantId: "tenant_default",
        publicKey: Buffer.from([1, 2, 3, 4]).toString("base64url"),
        counter: 0,
      });

      const replayRes = await verifyRegistration({
        token,
        credentialId: "credential-one",
      });
      expect(replayRes.status).toBe(400);
      const replayBody = await replayRes.json();
      expect(replayBody.error.message).toBe("Passkey challenge expired");
    });

    it("names unnamed passkeys by position", async () => {
      const token = await login("admin", "secret");

      const first = await registerPasskey({
        token,
        credentialId: "credential-one",
      });
      const second = await registerPasskey({
        token,
        credentialId: "credential-two",
        name: "   ",
      });

      expect(first.name).toBe("Passkey 1");
      expect(second.name).toBe("Passkey 2");
    });

    it("returns 400 when verification throws", async () => {
      const token = await login("admin", "secret");
      expect((await requestRegistrationOptions(token)).status).toBe(200);

      verifyRegistrationResponseMock.mockRejectedValueOnce(
        new Error("Unexpected registration response challenge"),
      );
      const res = await verifyRegistration({
        token,
        credentialId: "credential-one",
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.message).toBe("Passkey could not be verified");
      await expect(getStoredPasskey("credential-one")).resolves.toBeNull();
    });

    it("returns 400 when the attestation is not verified", async () => {
      const token = await login("admin", "secret");
      expect((await requestRegistrationOptions(token)).status).toBe(200);

      verifyRegistrationResponseMock.mockResolvedValueOnce({ verified: false });
      const res = await verifyRegistration({
        token,
        credentialId: "credential-one",
      });

      expect(res.status).toBe(400);
    });

    it("returns 409 for a credential id that is already registered", async () => {
      const token = await login("admin", "secret");
      await registerPasskey({ token, credentialId: "credential-one" });

      expect((await requestRegistrationOptions(token)).status).toBe(200);
      const res = await verifyRegistration({
        token,
        credentialId: "credential-one",
      });
      const body = await res.json();

      expect(res.status).toBe(409);
      expect(body.error.code).toBe("CONFLICT");
    });

    it("returns 400 for a malformed credential response", async () => {
      const token = await login("admin", "secret");
      expect((await requestRegistrationOptions(token)).status).toBe(200);

      const res = await fetch(`${baseUrl}/api/auth/passkeys/register/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ response: { id: "credential-one" } }),
      });

      expect(res.status).toBe(400);
      expect(verifyRegistrationResponseMock).not.toHaveBeenCalled();
    });

    it("requires authentication", async () => {
      const res = await requestRegistrationOptions("not-a-token");
      expect(res.status).toBe(401);
    });
  });

  describe("login", () => {
    it("issues login options without authentication", async () => {
      const res = await fetch(`${baseUrl}/api/auth/passkeys/login/options`, {
        method: "POST",
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.options).toEqual(AUTHENTICATION_OPTIONS);
      expect(body.data.challengeId).toEqual(expect.any(String));
      expect(generateAuthenticationOptionsMock).toHaveBeenCalledWith({
        rpID: "localhost",
        userVerification: "required",
      });
    });

    it("signs the credential owner in and records the ceremony", async () => {
      const token = await login("admin", "secret");
      await registerPasskey({ token, credentialId: "credential-one" });

      const challengeId = await requestLoginChallenge();
      const res = await verifyLogin({
        challengeId,
        credentialId: "credential-one",
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.data.expiresIn).toBeGreaterThan(0);
      expect(body.data.user).toMatchObject({
        username: "admin",
        workspaceId: "tenant_default",
      });
      expect(verifyAuthenticationResponseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedChallenge: "authentication-challenge",
          expectedOrigin: ["http://localhost:5173"],
          expectedRPID: "localhost",
          requireUserVerification: true,
          credential: expect.objectContaining({
            id: "credential-one",
            counter: 0,
            transports: ["internal", "hybrid"],
          }),
        }),
      );

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${body.data.token}` },
      });
      const meBody = await meRes.json();
      expect(meRes.status).toBe(200);
      expect(meBody.data.user.id).toBe(body.data.user.id);

      const { db, schema } = await import("@server/db");
      const sessions = await db
        .select({ subject: schema.authSessions.subject })
        .from(schema.authSessions);
      expect(sessions).toEqual([
        { subject: body.data.user.id },
        { subject: body.data.user.id },
      ]);

      const stored = await getStoredPasskey("credential-one");
      expect(stored?.counter).toBe(7);
      expect(stored?.lastUsedAt).toBeGreaterThan(
        Math.floor(Date.now() / 1000) - 60,
      );
      expect(stored?.lastUsedAt).toBeLessThanOrEqual(
        Math.floor(Date.now() / 1000),
      );

      const replayRes = await verifyLogin({
        challengeId,
        credentialId: "credential-one",
      });
      expect(replayRes.status).toBe(400);
    });

    it("refreshes the backup state reported by the authenticator", async () => {
      const token = await login("admin", "secret");
      const summary = await registerPasskey({
        token,
        credentialId: "credential-one",
      });
      expect(summary).toMatchObject({
        deviceType: "multiDevice",
        backedUp: true,
      });

      const challengeId = await requestLoginChallenge();
      verifyAuthenticationResponseMock.mockResolvedValueOnce({
        verified: true,
        authenticationInfo: {
          newCounter: 8,
          credentialDeviceType: "singleDevice",
          credentialBackedUp: false,
        },
      });
      const res = await verifyLogin({
        challengeId,
        credentialId: "credential-one",
      });

      expect(res.status).toBe(200);
      expect(await getStoredPasskey("credential-one")).toMatchObject({
        deviceType: "singleDevice",
        backedUp: false,
      });
    });

    it("returns 503 when the JWT secret is misconfigured", async () => {
      await stopServer({ server, closeDb, tempDir });
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: { ...AUTH_ENV, JWT_SECRET: "too-short" },
      }));

      const user = await createUser({
        username: "bianca",
        password: "bianca-secret",
      });
      const { db, schema } = await import("@server/db");
      await db.insert(schema.passkeyCredentials).values({
        id: "credential-two",
        tenantId: user.workspaceId,
        userId: user.id,
        name: "Phone",
        publicKey: Buffer.from([1, 2, 3, 4]).toString("base64url"),
        counter: 0,
      });

      const challengeId = await requestLoginChallenge();
      const res = await verifyLogin({
        challengeId,
        credentialId: "credential-two",
      });
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.error.message).toContain("JWT_SECRET");
    });

    it("returns 401 for an unknown credential", async () => {
      const challengeId = await requestLoginChallenge();
      const res = await verifyLogin({
        challengeId,
        credentialId: "credential-missing",
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.message).toBe("Passkey not recognized");
      expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
    });

    it("returns 401 when verification throws", async () => {
      const token = await login("admin", "secret");
      await registerPasskey({ token, credentialId: "credential-one" });

      const challengeId = await requestLoginChallenge();
      verifyAuthenticationResponseMock.mockRejectedValueOnce(
        new Error("Unexpected authentication response origin"),
      );
      const res = await verifyLogin({
        challengeId,
        credentialId: "credential-one",
      });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error.message).toBe("Passkey not recognized");
    });

    it("returns 401 when the assertion is not verified", async () => {
      const token = await login("admin", "secret");
      await registerPasskey({ token, credentialId: "credential-one" });

      const challengeId = await requestLoginChallenge();
      verifyAuthenticationResponseMock.mockResolvedValueOnce({
        verified: false,
        authenticationInfo: {
          newCounter: 9,
          credentialDeviceType: "multiDevice",
          credentialBackedUp: true,
        },
      });
      const res = await verifyLogin({
        challengeId,
        credentialId: "credential-one",
      });

      expect(res.status).toBe(401);
      expect((await getStoredPasskey("credential-one"))?.counter).toBe(0);
    });

    it("returns 400 for an unknown challenge id", async () => {
      const res = await verifyLogin({
        challengeId: "not-a-challenge",
        credentialId: "credential-one",
      });
      const body = await res.json();

      expect(res.status).toBe(400);
      expect(body.error.message).toBe("Passkey challenge expired");
    });

    it("returns 401 for a disabled user", async () => {
      const usersRepo = await import("@server/repositories/users");
      const user = await createUser({
        username: "bianca",
        password: "bianca-secret",
      });
      const token = await login("bianca", "bianca-secret");
      await registerPasskey({ token, credentialId: "credential-two" });
      await usersRepo.setUserDisabled(user.id, true);

      const challengeId = await requestLoginChallenge();
      const res = await verifyLogin({
        challengeId,
        credentialId: "credential-two",
      });

      expect(res.status).toBe(401);
      expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
    });

    it("returns 401 when the credential tenant no longer matches its owner", async () => {
      const token = await login("admin", "secret");
      await registerPasskey({ token, credentialId: "credential-one" });
      const otherTenantUser = await createUser({
        username: "bianca",
        password: "bianca-secret",
      });

      const { db, schema } = await import("@server/db");
      await db
        .update(schema.passkeyCredentials)
        .set({ tenantId: otherTenantUser.workspaceId })
        .where(eq(schema.passkeyCredentials.id, "credential-one"));

      const challengeId = await requestLoginChallenge();
      const res = await verifyLogin({
        challengeId,
        credentialId: "credential-one",
      });

      expect(res.status).toBe(401);
      expect(verifyAuthenticationResponseMock).not.toHaveBeenCalled();
    });

    it("returns 400 before initial setup", async () => {
      await stopServer({ server, closeDb, tempDir });
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          JOBOPS_TEST_AUTH_BYPASS: "0",
          WEBAUTHN_ORIGINS: "http://localhost:5173",
        },
      }));

      const res = await fetch(`${baseUrl}/api/auth/passkeys/login/options`, {
        method: "POST",
      });

      expect(res.status).toBe(400);
    });

    it("returns 503 when no relying party origin is configured", async () => {
      await stopServer({ server, closeDb, tempDir });
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          ...AUTH_ENV,
          WEBAUTHN_ORIGINS: undefined,
          JOBOPS_PUBLIC_BASE_URL: undefined,
        },
      }));

      const res = await fetch(`${baseUrl}/api/auth/passkeys/login/options`, {
        method: "POST",
      });
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.error.message).toContain("WEBAUTHN_ORIGINS");
    });
  });

  describe("management", () => {
    it("lists, renames and deletes only the caller's passkeys", async () => {
      const adminToken = await login("admin", "secret");
      await registerPasskey({
        token: adminToken,
        credentialId: "credential-one",
        name: "Laptop",
      });

      await createUser({ username: "bianca", password: "bianca-secret" });
      const biancaToken = await login("bianca", "bianca-secret");
      await registerPasskey({
        token: biancaToken,
        credentialId: "credential-two",
        name: "Phone",
      });

      const listRes = await fetch(`${baseUrl}/api/auth/passkeys`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const listBody = await listRes.json();
      expect(listRes.status).toBe(200);
      expect(listBody.data).toHaveLength(1);
      expect(listBody.data[0].id).toBe("credential-one");

      const renameOther = await fetch(
        `${baseUrl}/api/auth/passkeys/credential-two`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ name: "Stolen" }),
        },
      );
      expect(renameOther.status).toBe(404);

      const deleteOther = await fetch(
        `${baseUrl}/api/auth/passkeys/credential-two`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        },
      );
      expect(deleteOther.status).toBe(404);
      expect(await getStoredPasskey("credential-two")).not.toBeNull();

      const renameOwn = await fetch(
        `${baseUrl}/api/auth/passkeys/credential-one`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ name: "  Work laptop  " }),
        },
      );
      const renameBody = await renameOwn.json();
      expect(renameOwn.status).toBe(200);
      expect(renameBody.data.name).toBe("Work laptop");

      const deleteOwn = await fetch(
        `${baseUrl}/api/auth/passkeys/credential-one`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${adminToken}` },
        },
      );
      const deleteBody = await deleteOwn.json();
      expect(deleteOwn.status).toBe(200);
      expect(deleteBody.data).toEqual({ deleted: true });
      expect(await getStoredPasskey("credential-one")).toBeNull();
    });

    it("returns 400 for an invalid rename", async () => {
      const token = await login("admin", "secret");
      await registerPasskey({ token, credentialId: "credential-one" });

      const res = await fetch(`${baseUrl}/api/auth/passkeys/credential-one`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: "   " }),
      });

      expect(res.status).toBe(400);
    });

    it("requires authentication", async () => {
      const res = await fetch(`${baseUrl}/api/auth/passkeys`);
      expect(res.status).toBe(401);
    });
  });

  describe("public demo", () => {
    beforeEach(async () => {
      await stopServer({ server, closeDb, tempDir });
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          DEMO_MODE: "true",
          JOBOPS_TEST_AUTH_BYPASS: "0",
          BASIC_AUTH_USER: "",
          BASIC_AUTH_PASSWORD: "",
          WEBAUTHN_ORIGINS: "http://localhost:5173",
        },
      }));
    });

    it("disables passkey sign-in", async () => {
      const res = await fetch(`${baseUrl}/api/auth/passkeys/login/options`, {
        method: "POST",
      });
      const body = await res.json();

      expect(res.status).toBe(503);
      expect(body.error.message).toContain("public demo");
    });

    it("keeps passkey management behind authentication", async () => {
      const res = await fetch(`${baseUrl}/api/auth/passkeys`);
      expect(res.status).toBe(401);
    });
  });
});
