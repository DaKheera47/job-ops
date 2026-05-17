import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

const AUTH_ENV = {
  BASIC_AUTH_USER: "admin",
  BASIC_AUTH_PASSWORD: "secret",
  JWT_SECRET: "an-explicit-jwt-secret-with-at-least-32-chars",
  JOBOPS_TEST_AUTH_BYPASS: "0",
};

function stateUrl(
  baseUrl: string,
  source: string,
  sourceJobId: string,
): string {
  return `${baseUrl}/api/watchlist/states/${encodeURIComponent(source)}/${encodeURIComponent(sourceJobId)}`;
}

async function login(baseUrl: string, username: string, password: string) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json();
  expect(res.status).toBe(200);
  return body.data.token as string;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

describe.sequential("Watchlist API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  describe("durable states", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer());
    });

    it("upserts ignored states and removes them on unignore", async () => {
      const source = "workday:autodesk";
      const sourceJobId = "26WD97952";

      const firstRes = await fetch(stateUrl(baseUrl, source, sourceJobId), {
        method: "PUT",
      });
      const firstBody = await firstRes.json();
      expect(firstRes.status).toBe(200);
      expect(firstBody.ok).toBe(true);
      expect(firstBody.data.state).toMatchObject({
        source,
        sourceJobId,
        state: "ignored",
      });

      const secondRes = await fetch(stateUrl(baseUrl, source, sourceJobId), {
        method: "PUT",
      });
      expect(secondRes.status).toBe(200);

      const listBody = await fetch(`${baseUrl}/api/watchlist/states`).then(
        (res) => res.json(),
      );
      expect(listBody.ok).toBe(true);
      expect(listBody.data.states).toHaveLength(1);
      expect(listBody.data.states[0]).toMatchObject({
        source,
        sourceJobId,
        state: "ignored",
      });

      const deleteRes = await fetch(stateUrl(baseUrl, source, sourceJobId), {
        method: "DELETE",
      });
      const deleteBody = await deleteRes.json();
      expect(deleteRes.status).toBe(200);
      expect(deleteBody).toMatchObject({ ok: true, data: { cleared: true } });

      const emptyBody = await fetch(`${baseUrl}/api/watchlist/states`).then(
        (res) => res.json(),
      );
      expect(emptyBody.data.states).toEqual([]);
    });
  });

  describe("tenant scoping", () => {
    beforeEach(async () => {
      ({ server, baseUrl, closeDb, tempDir } = await startServer({
        env: AUTH_ENV,
      }));
    });

    it("returns only the active tenant's state rows", async () => {
      const adminToken = await login(baseUrl, "admin", "secret");

      const createAdamRes = await fetch(`${baseUrl}/api/workspaces/users`, {
        method: "POST",
        headers: authHeaders(adminToken),
        body: JSON.stringify({
          username: "adam",
          displayName: "Adam",
          password: "adam-secret",
        }),
      });
      expect(createAdamRes.status).toBe(201);

      const adamToken = await login(baseUrl, "adam", "adam-secret");
      const source = "workday:autodesk";
      const sourceJobId = "26WD97952";

      const ignoreRes = await fetch(stateUrl(baseUrl, source, sourceJobId), {
        method: "PUT",
        headers: authHeaders(adminToken),
      });
      expect(ignoreRes.status).toBe(200);

      const adamBody = await fetch(`${baseUrl}/api/watchlist/states`, {
        headers: { Authorization: `Bearer ${adamToken}` },
      }).then((res) => res.json());
      expect(adamBody.ok).toBe(true);
      expect(adamBody.data.states).toEqual([]);

      const adminBody = await fetch(`${baseUrl}/api/watchlist/states`, {
        headers: { Authorization: `Bearer ${adminToken}` },
      }).then((res) => res.json());
      expect(adminBody.data.states).toHaveLength(1);
      expect(adminBody.data.states[0]).toMatchObject({
        source,
        sourceJobId,
        state: "ignored",
      });
    });
  });
});
