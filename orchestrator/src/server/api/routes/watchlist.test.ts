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

    it("loads watchlist sources from the career board catalog json", async () => {
      const res = await fetch(`${baseUrl}/api/watchlist/sources`);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.catalogSources).toEqual([
        expect.objectContaining({
          id: "workday:https://autodesk.wd1.myworkdayjobs.com/Ext",
          label: "Autodesk",
          sourceType: "workday",
          careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext",
          cxsJobsUrl:
            "https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs",
        }),
        expect.objectContaining({
          id: "workday:https://pg.wd5.myworkdayjobs.com/en-US/1000",
          label: "P&G",
          sourceType: "workday",
          careersUrl: "https://pg.wd5.myworkdayjobs.com/en-US/1000",
          cxsJobsUrl: "https://pg.wd5.myworkdayjobs.com/wday/cxs/pg/1000/jobs",
        }),
      ]);
      expect(body.data.selectedSources).toEqual([]);
    });

    it("stores only the user's selected watchlist sources", async () => {
      const firstRes = await fetch(`${baseUrl}/api/watchlist/sources`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections: [
            {
              catalogSourceId:
                "workday:https://autodesk.wd1.myworkdayjobs.com/Ext",
              sourceType: "workday",
              careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext",
            },
            {
              sourceType: "workday",
              careersUrl: "https://example.wd1.myworkdayjobs.com/en-US/careers",
              label: "https://example.wd1.myworkdayjobs.com/en-US/careers",
            },
          ],
        }),
      });
      const firstBody = await firstRes.json();

      expect(firstRes.status).toBe(200);
      expect(firstBody.ok).toBe(true);
      expect(firstBody.data.selectedSources).toEqual([
        expect.objectContaining({
          catalogSourceId: "workday:https://autodesk.wd1.myworkdayjobs.com/Ext",
          label: "Autodesk",
          careersUrl: "https://autodesk.wd1.myworkdayjobs.com/Ext",
          sourceType: "workday",
          isCustom: false,
          sortOrder: 0,
        }),
        expect.objectContaining({
          catalogSourceId: null,
          label: "Example",
          careersUrl: "https://example.wd1.myworkdayjobs.com/en-US/careers",
          sourceType: "workday",
          isCustom: true,
          sortOrder: 1,
        }),
      ]);

      const secondBody = await fetch(`${baseUrl}/api/watchlist/sources`).then(
        (res) => res.json(),
      );
      expect(secondBody.data.selectedSources).toHaveLength(2);
      expect(secondBody.data.selectedSources[1]).toEqual(
        expect.objectContaining({
          label: "Example",
          careersUrl: "https://example.wd1.myworkdayjobs.com/en-US/careers",
        }),
      );
    });

    it("derives a custom label from Workday tenant slugs when the site slug is generic", async () => {
      const res = await fetch(`${baseUrl}/api/watchlist/sources`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selections: [
            {
              sourceType: "workday",
              careersUrl: "https://pg.wd5.myworkdayjobs.com/en-US/1000",
              label: "https://pg.wd5.myworkdayjobs.com/en-US/1000",
            },
          ],
        }),
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.data.selectedSources).toEqual([
        expect.objectContaining({
          label: "PG",
          careersUrl: "https://pg.wd5.myworkdayjobs.com/en-US/1000",
          sourceType: "workday",
          isCustom: true,
        }),
      ]);
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
