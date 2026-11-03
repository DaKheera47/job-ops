import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Proxy header auth routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  const BASE_ENV = {
    JWT_SECRET: "an-explicit-jwt-secret-with-at-least-32-chars",
    JOBOPS_TEST_AUTH_BYPASS: "0",
  };
  const PROXY_ENV = {
    ...BASE_ENV,
    PROXY_AUTH_ENABLED: "true",
    PROXY_AUTH_TRUSTED_PROXIES: "127.0.0.1",
  };

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  async function start(env: Record<string, string | undefined>) {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({ env }));
  }

  async function setupAdmin(): Promise<void> {
    const res = await fetch(`${baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "super-secret-password",
      }),
    });
    expect(res.status).toBe(201);
  }

  function proxyLogin(headers: Record<string, string>): Promise<Response> {
    return fetch(`${baseUrl}/api/auth/proxy`, { method: "POST", headers });
  }

  describe("GET /api/auth/proxy/status", () => {
    it("reports disabled by default", async () => {
      await start(BASE_ENV);
      const res = await fetch(`${baseUrl}/api/auth/proxy/status`);
      expect(res.status).toBe(200);
      expect((await res.json()).data).toEqual({ enabled: false });
    });

    it("reports enabled when configured", async () => {
      await start(PROXY_ENV);
      const res = await fetch(`${baseUrl}/api/auth/proxy/status`);
      expect((await res.json()).data).toEqual({ enabled: true });
    });
  });

  describe("POST /api/auth/proxy", () => {
    it("returns 404 when the feature is disabled", async () => {
      await start(BASE_ENV);
      await setupAdmin();
      const res = await proxyLogin({ "x-remote-user": "admin" });
      expect(res.status).toBe(404);
    });

    it("returns 403 when the caller is not a trusted proxy", async () => {
      await start({ ...PROXY_ENV, PROXY_AUTH_TRUSTED_PROXIES: "10.9.9.9" });
      await setupAdmin();
      const res = await proxyLogin({ "x-remote-user": "admin" });
      expect(res.status).toBe(403);
    });

    it("returns 401 when the user header is missing", async () => {
      await start(PROXY_ENV);
      await setupAdmin();
      const res = await proxyLogin({});
      expect(res.status).toBe(401);
    });

    it("requires initial setup before accepting any proxy identity", async () => {
      await start({ ...PROXY_ENV, PROXY_AUTH_ALLOW_SIGNUP: "true" });
      const res = await proxyLogin({ "x-remote-user": "someone" });
      expect(res.status).toBe(400);
    });

    it("issues a usable session for an existing user", async () => {
      await start(PROXY_ENV);
      await setupAdmin();

      const res = await proxyLogin({ "x-remote-user": "Admin" });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.created).toBe(false);
      expect(body.data.user.username).toBe("admin");

      const me = await fetch(`${baseUrl}/api/auth/me`, {
        headers: { Authorization: `Bearer ${body.data.token}` },
      });
      expect(me.status).toBe(200);
    });

    it("rejects unknown users when signup is off", async () => {
      await start(PROXY_ENV);
      await setupAdmin();
      const res = await proxyLogin({ "x-remote-user": "newcomer" });
      expect(res.status).toBe(403);
    });

    it("provisions an isolated workspace when signup is on", async () => {
      await start({
        ...PROXY_ENV,
        PROXY_AUTH_ALLOW_SIGNUP: "true",
        PROXY_AUTH_NAME_HEADER: "x-remote-name",
      });
      await setupAdmin();

      const res = await proxyLogin({
        "x-remote-user": "newcomer",
        "x-remote-name": "New Comer",
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.data.created).toBe(true);
      expect(body.data.user.displayName).toBe("New Comer");
      expect(body.data.user.isSystemAdmin).toBe(false);

      const admin = await proxyLogin({ "x-remote-user": "admin" });
      const adminBody = await admin.json();
      expect(body.data.user.workspaceId).not.toBe(
        adminBody.data.user.workspaceId,
      );
    });

    it("rejects disabled users", async () => {
      await start(PROXY_ENV);
      await setupAdmin();
      const { db, schema } = await import("@server/db");
      await db
        .update(schema.users)
        .set({ isDisabled: true })
        .where(eq(schema.users.username, "admin"));

      const res = await proxyLogin({ "x-remote-user": "admin" });
      expect(res.status).toBe(401);
    });
  });
});
