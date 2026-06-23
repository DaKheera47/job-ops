import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Auth routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  const AUTH_ENV = {
    BASIC_AUTH_USER: "admin",
    BASIC_AUTH_PASSWORD: "secret",
    JWT_SECRET: "an-explicit-jwt-secret-with-at-least-32-chars",
    JOBOPS_TEST_AUTH_BYPASS: "0",
  };

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  async function countTenants(): Promise<number> {
    const { db, schema } = await import("@server/db");
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tenants);
    return row?.count ?? 0;
  }

  async function getTenantMembership(input: { userId: string }) {
    const { db, schema } = await import("@server/db");
    const [row] = await db
      .select({
        tenantId: schema.tenantMemberships.tenantId,
        role: schema.tenantMemberships.role,
      })
      .from(schema.tenantMemberships)
      .where(eq(schema.tenantMemberships.userId, input.userId))
      .limit(1);
    return row ?? null;
  }

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: AUTH_ENV,
      }));
    });

    it("returns a JWT for valid credentials", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "secret" }),
      });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.token).toBeTruthy();
      expect(body.data.expiresIn).toBeGreaterThan(0);
    });

    it("returns 401 for invalid credentials", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "wrong" }),
      });

      expect(res.status).toBe(401);
    });

    it("returns 400 for missing fields", async () => {
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 400 when auth is disabled", async () => {
      await stopServer({ server, closeDb, tempDir });
      ({ server, baseUrl, closeDb, tempDir } = await startServer());

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "secret" }),
      });

      expect(res.status).toBe(400);
    });

    it("generates and persists a local JWT secret when none is configured", async () => {
      await stopServer({ server, closeDb, tempDir });
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          BASIC_AUTH_USER: "admin",
          BASIC_AUTH_PASSWORD: "secret",
          JOBOPS_TEST_AUTH_BYPASS: "0",
        },
      }));

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "secret" }),
      });

      expect(res.status).toBe(200);
      const persistedSecret = (
        await readFile(join(tempDir, "jwt-secret"), "utf8")
      ).trim();
      expect(persistedSecret.length).toBeGreaterThanOrEqual(32);
    });
  });

  describe("POST /api/auth/signup", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          JOBOPS_TEST_AUTH_BYPASS: "0",
          JOBOPS_APP_MODE: "hosted",
          JOBOPS_HOSTED_SIGNUPS_ENABLED: "true",
          JOBOPS_HOSTED_TENANT_ID: "tenant_default",
        },
      }));
    });

    it("creates a hosted tenant member and signs them in", async () => {
      const tenantsBefore = await countTenants();
      const signupRes = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req-hosted-signup",
        },
        body: JSON.stringify({
          username: " NewUser ",
          displayName: "New User",
          password: "super-secret-password",
        }),
      });

      expect(signupRes.status).toBe(201);
      expect(signupRes.headers.get("x-request-id")).toBe("req-hosted-signup");
      const signupBody = await signupRes.json();
      expect(signupBody.ok).toBe(true);
      expect(signupBody.meta.requestId).toBe("req-hosted-signup");
      expect(signupBody.data.token).toBeTruthy();
      expect(signupBody.data.expiresIn).toBeGreaterThan(0);
      expect(signupBody.data.user).toMatchObject({
        username: "newuser",
        displayName: "New User",
        isSystemAdmin: false,
        isDisabled: false,
        workspaceId: "tenant_default",
        workspaceName: "JobOps",
      });

      await expect(countTenants()).resolves.toBe(tenantsBefore);
      await expect(
        getTenantMembership({ userId: signupBody.data.user.id }),
      ).resolves.toEqual({
        tenantId: "tenant_default",
        role: "member",
      });

      const meRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${signupBody.data.token}` },
      });
      expect(meRes.status).toBe(200);
      const meBody = await meRes.json();
      expect(meBody.ok).toBe(true);
      expect(meBody.data.user).toMatchObject({
        id: signupBody.data.user.id,
        username: "newuser",
        workspaceId: "tenant_default",
        isSystemAdmin: false,
      });
    });

    it("returns 409 for duplicate usernames", async () => {
      const firstRes = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "adam",
          password: "adam-secret",
        }),
      });
      expect(firstRes.status).toBe(201);

      const secondRes = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: " Adam ",
          password: "adam-secret-2",
        }),
      });

      expect(secondRes.status).toBe(409);
      const body = await secondRes.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("CONFLICT");
      expect(body.error.message).toContain("Username already exists");
    });

    it("scopes backend analytics identity by hosted user", async () => {
      async function signup(username: string): Promise<string> {
        const res = await fetch(`${baseUrl}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username,
            password: `${username}-secret`,
          }),
        });
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.ok).toBe(true);
        return body.data.token as string;
      }

      async function analyticsDistinctId(token: string): Promise<string> {
        const res = await fetch(`${baseUrl}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.ok).toBe(true);
        return body.data.analyticsDistinctId as string;
      }

      const aliceToken = await signup("analytics-alice");
      const bobToken = await signup("analytics-bob");

      const aliceFirst = await analyticsDistinctId(aliceToken);
      const aliceSecond = await analyticsDistinctId(aliceToken);
      const bob = await analyticsDistinctId(bobToken);

      expect(aliceFirst).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(aliceSecond).toBe(aliceFirst);
      expect(bob).not.toBe(aliceFirst);
    });

    it("returns 400 for invalid signup input", async () => {
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "sam", password: "short" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INVALID_REQUEST");
      expect(body.error.message).toBe(
        "Password must be at least 8 characters.",
      );
    });
  });

  describe("POST /api/auth/signup gated modes", () => {
    it("rejects signup in local mode", async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          JOBOPS_TEST_AUTH_BYPASS: "0",
        },
      }));

      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "local-user",
          password: "local-secret",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
    });

    it("rejects signup when hosted signups are disabled", async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          JOBOPS_TEST_AUTH_BYPASS: "0",
          JOBOPS_APP_MODE: "hosted",
          JOBOPS_HOSTED_TENANT_ID: "tenant_default",
        },
      }));

      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "closed-user",
          password: "closed-secret",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain("Hosted signups are disabled");
    });

    it("rejects signup in demo mode", async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          DEMO_MODE: "true",
          JOBOPS_TEST_AUTH_BYPASS: "0",
          JOBOPS_APP_MODE: "hosted",
          JOBOPS_HOSTED_SIGNUPS_ENABLED: "true",
          JOBOPS_HOSTED_TENANT_ID: "tenant_default",
        },
      }));

      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "demo-user",
          password: "demo-secret",
        }),
      });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    });

    it("rejects signup when the configured hosted tenant is missing", async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          JOBOPS_TEST_AUTH_BYPASS: "0",
          JOBOPS_APP_MODE: "hosted",
          JOBOPS_HOSTED_SIGNUPS_ENABLED: "true",
          JOBOPS_HOSTED_TENANT_ID: "tenant_missing",
        },
      }));

      const tenantsBefore = await countTenants();
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "missing-tenant-user",
          password: "missing-secret",
        }),
      });

      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
      expect(body.error.message).toContain(
        "Configured hosted tenant is not available",
      );
      await expect(countTenants()).resolves.toBe(tenantsBefore);
    });
  });

  describe("JWT-authenticated requests", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: AUTH_ENV,
      }));
    });

    it("accepts a valid JWT on protected routes", async () => {
      // Get a token.
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "secret" }),
      });
      const { data } = await loginRes.json();

      // Use it on a protected route.
      const protectedRes = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: `Bearer ${data.token}` },
      });

      expect(protectedRes.status).not.toBe(401);
    });

    it("rejects an invalid JWT", async () => {
      const res = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: "Bearer invalid.token.here" },
      });

      expect(res.status).toBe(401);
    });

    it("returns a stable backend analytics distinct id from /api/auth/me", async () => {
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "secret" }),
      });
      const { data } = await loginRes.json();
      const token = data.token as string;

      const firstMeRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(firstMeRes.status).toBe(200);
      const firstMeBody = await firstMeRes.json();
      expect(firstMeBody.ok).toBe(true);
      expect(firstMeBody.data.user.id).toBeTruthy();
      expect(firstMeBody.data.analyticsDistinctId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );

      const secondMeRes = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(secondMeRes.status).toBe(200);
      const secondMeBody = await secondMeRes.json();
      expect(secondMeBody.ok).toBe(true);
      expect(secondMeBody.data.analyticsDistinctId).toBe(
        firstMeBody.data.analyticsDistinctId,
      );
    });
  });

  describe("POST /api/auth/setup", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer());
    });

    it("creates the first admin in local mode", async () => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-request-id": "req-local-setup",
        },
        body: JSON.stringify({
          username: "admin",
          displayName: "Admin",
          password: "super-secret-password",
        }),
      });

      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.meta.requestId).toBe("req-local-setup");
      expect(body.data.token).toBeTruthy();
      expect(body.data.user).toMatchObject({
        username: "admin",
        displayName: "Admin",
        isSystemAdmin: true,
        workspaceId: "tenant_default",
      });
    });

    it("rejects a short first-admin password", async () => {
      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "short" }),
      });

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.message).toBe(
        "Password must be at least 8 characters.",
      );
      expect(body.error.details.fieldErrors.password).toBe("[REDACTED]");
    });

    it("rejects first-run setup in hosted mode", async () => {
      await stopServer({ server, closeDb, tempDir });
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          JOBOPS_TEST_AUTH_BYPASS: "0",
          JOBOPS_APP_MODE: "hosted",
          JOBOPS_HOSTED_TENANT_ID: "tenant_default",
        },
      }));

      const res = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "admin",
          password: "super-secret-password",
        }),
      });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("FORBIDDEN");
      expect(body.error.message).toContain(
        "First-run setup is disabled in hosted mode",
      );
    });

    it("does not report first-run setup as required in hosted mode", async () => {
      await stopServer({ server, closeDb, tempDir });
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          JOBOPS_TEST_AUTH_BYPASS: "0",
          JOBOPS_APP_MODE: "hosted",
          JOBOPS_HOSTED_TENANT_ID: "tenant_default",
        },
      }));

      const res = await fetch(`${baseUrl}/api/auth/bootstrap-status`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.data.setupRequired).toBe(false);
    });
  });

  describe("public demo auth behavior", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: {
          DEMO_MODE: "true",
          JOBOPS_TEST_AUTH_BYPASS: "0",
          BASIC_AUTH_USER: "",
          BASIC_AUTH_PASSWORD: "",
        },
      }));
    });

    it("allows anonymous read access to demo-backed APIs", async () => {
      const res = await fetch(`${baseUrl}/api/profile/projects`);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data.length).toBeGreaterThan(0);
    });

    it("does not allow creating the first admin in demo mode", async () => {
      const bootstrapRes = await fetch(`${baseUrl}/api/auth/bootstrap-status`);
      expect(bootstrapRes.status).toBe(200);
      const bootstrapBody = await bootstrapRes.json();
      expect(bootstrapBody.ok).toBe(true);
      expect(bootstrapBody.data.setupRequired).toBe(false);

      const setupRes = await fetch(`${baseUrl}/api/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "admin",
          password: "super-secret-password",
        }),
      });

      expect(setupRes.status).toBe(503);
      const setupBody = await setupRes.json();
      expect(setupBody.ok).toBe(false);
      expect(setupBody.error.message).toContain("disabled in the public demo");
    });
  });

  describe("POST /api/auth/logout", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: AUTH_ENV,
      }));
    });

    it("invalidates the token", async () => {
      // Login.
      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "secret" }),
      });
      const { data } = await loginRes.json();
      const token = data.token;

      // Verify token works.
      const before = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(before.status).not.toBe(401);

      // Logout.
      const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(logoutRes.status).toBe(200);

      // Token should now be rejected.
      const after = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(after.status).toBe(401);
    });

    it("is idempotent — logout without token returns 200", async () => {
      const res = await fetch(`${baseUrl}/api/auth/logout`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
    });
  });

  describe("backward compatibility", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: AUTH_ENV,
      }));
    });

    it("rejects Basic headers on protected routes while still allowing login with credentials", async () => {
      const credentials = Buffer.from("admin:secret").toString("base64");
      const res = await fetch(`${baseUrl}/api/settings`, {
        headers: { Authorization: `Basic ${credentials}` },
      });

      expect(res.status).toBe(401);

      const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "secret" }),
      });

      expect(loginRes.status).toBe(200);
    });
  });
});
