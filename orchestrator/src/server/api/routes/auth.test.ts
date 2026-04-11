import { readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { join } from "node:path";
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
  };

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

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
