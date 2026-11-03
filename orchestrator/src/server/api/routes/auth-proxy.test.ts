import { request as httpRequest, type Server } from "node:http";
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

    it("refuses requests a browser marks as cross-origin", async () => {
      await start(PROXY_ENV);
      await setupAdmin();

      for (const site of ["cross-site", "same-site"]) {
        const res = await proxyLogin({
          "x-remote-user": "admin",
          "sec-fetch-site": site,
        });
        expect(res.status).toBe(403);
        expect(res.headers.get("access-control-allow-origin")).toBeNull();
      }

      const sameOrigin = await proxyLogin({
        "x-remote-user": "admin",
        "sec-fetch-site": "same-origin",
      });
      expect(sameOrigin.status).toBe(200);
    });

    it("falls back to the Origin header without Fetch Metadata", async () => {
      await start(PROXY_ENV);
      await setupAdmin();

      const foreign = await proxyLogin({
        "x-remote-user": "admin",
        origin: "https://evil.example",
      });
      expect(foreign.status).toBe(403);

      const own = await proxyLogin({
        "x-remote-user": "admin",
        origin: baseUrl,
      });
      expect(own.status).toBe(200);
    });

    it("never exposes the token response to other origins via CORS", async () => {
      await start(PROXY_ENV);
      await setupAdmin();

      const res = await proxyLogin({
        "x-remote-user": "admin",
        origin: baseUrl,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("rejects a repeated user header instead of provisioning a merged name", async () => {
      await start({ ...PROXY_ENV, PROXY_AUTH_ALLOW_SIGNUP: "true" });
      await setupAdmin();

      // fetch folds repeated headers into one field, so send two real lines.
      const status = await new Promise<number>((resolve, reject) => {
        const req = httpRequest(
          `${baseUrl}/api/auth/proxy`,
          {
            method: "POST",
            headers: { "x-remote-user": ["alice", "bob"] },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          },
        );
        req.once("error", reject);
        req.end();
      });
      expect(status).toBe(401);

      const { db, schema } = await import("@server/db");
      const rows = await db.select().from(schema.users);
      expect(rows.map((row) => row.username)).toEqual(["admin"]);
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
