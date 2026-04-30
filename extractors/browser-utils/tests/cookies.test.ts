import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getCloudflareCookieStorageDir,
  invalidateCookies,
  readCookieJar,
  saveCookies,
} from "../src/cookies.js";

// loadCookies / saveCookies need a real Playwright BrowserContext which is
// heavy to set up.  We test the file-level functions that don't need one:
// readCookieJar, invalidateCookies.

function storageDir() {
  const dir = join(tmpdir(), `browser-utils-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeCookieJar(
  dir: string,
  extractorId: string,
  overrides: Record<string, unknown> = {},
) {
  const jar = {
    extractorId,
    savedAt: new Date().toISOString(),
    cookies: [
      {
        name: "cf_clearance",
        value: "fake",
        domain: ".example.com",
        path: "/",
        // Expires 1 hour from now
        expires: Date.now() / 1000 + 3600,
        httpOnly: true,
        secure: true,
        sameSite: "None",
      },
    ],
    ...overrides,
  };
  writeFileSync(
    join(dir, `${extractorId}-cookies.json`),
    JSON.stringify(jar, null, 2),
  );
}

describe("cookies", () => {
  const originalDataDir = process.env.DATA_DIR;

  afterEach(() => {
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
  });

  describe("getCloudflareCookieStorageDir", () => {
    it("stores cookies under DATA_DIR when configured", () => {
      process.env.DATA_DIR = "/tmp/job-ops-data";
      expect(getCloudflareCookieStorageDir()).toBe(
        join("/tmp/job-ops-data", "cloudflare-cookies"),
      );
    });

    it("uses explicit storage dirs for direct callers", () => {
      process.env.DATA_DIR = "/tmp/job-ops-data";
      expect(getCloudflareCookieStorageDir("/tmp/custom-cookies")).toBe(
        "/tmp/custom-cookies",
      );
    });
  });

  describe("readCookieJar", () => {
    it("returns hasCookies false when no file exists", async () => {
      const dir = storageDir();
      const result = await readCookieJar("nonexistent", dir);
      expect(result).toEqual({ hasCookies: false });
    });

    it("returns saved userAgent and hasCookies true", async () => {
      const dir = storageDir();
      writeCookieJar(dir, "hiringcafe", {
        userAgent: "Mozilla/5.0 SolverUA",
      });

      const result = await readCookieJar("hiringcafe", dir);
      expect(result.hasCookies).toBe(true);
      expect(result.userAgent).toBe("Mozilla/5.0 SolverUA");
    });

    it("returns hasCookies false when all cookies are expired", async () => {
      const dir = storageDir();
      writeCookieJar(dir, "hiringcafe", {
        cookies: [
          {
            name: "cf_clearance",
            value: "old",
            domain: ".example.com",
            path: "/",
            expires: Date.now() / 1000 - 3600, // expired 1 hour ago
            httpOnly: true,
            secure: true,
            sameSite: "None",
          },
        ],
        userAgent: "Mozilla/5.0 StaleUA",
      });

      const result = await readCookieJar("hiringcafe", dir);
      expect(result.hasCookies).toBe(false);
      // UA is still returned — caller decides whether to use it
      expect(result.userAgent).toBe("Mozilla/5.0 StaleUA");
    });

    it("returns undefined userAgent when jar has no UA field", async () => {
      const dir = storageDir();
      writeCookieJar(dir, "gradcracker"); // no userAgent override

      const result = await readCookieJar("gradcracker", dir);
      expect(result.hasCookies).toBe(true);
      expect(result.userAgent).toBeUndefined();
    });
  });

  describe("saveCookies", () => {
    function mockContext(
      cookies: Record<string, string>[],
      userAgent = "Mozilla/5.0 TestUA",
    ) {
      return {
        cookies: async () =>
          cookies.map((c) => ({
            name: c.name,
            value: c.value ?? "v",
            domain: c.domain ?? ".example.com",
            path: "/",
            expires: c.expires ? Number(c.expires) : Date.now() / 1000 + 3600,
            httpOnly: true,
            secure: true,
            sameSite: "None" as const,
          })),
        pages: () => [
          {
            evaluate: async () => userAgent,
          },
        ],
      } as unknown as import("playwright").BrowserContext;
    }

    it("persists userAgent from the browser context", async () => {
      const dir = storageDir();
      const ctx = mockContext(
        [{ name: "cf_clearance" }],
        "Mozilla/5.0 Camoufox/123",
      );

      await saveCookies(ctx, "test-extractor", dir);

      const jar = await readCookieJar("test-extractor", dir);
      expect(jar.hasCookies).toBe(true);
      expect(jar.userAgent).toBe("Mozilla/5.0 Camoufox/123");
    });

    it("writes undefined userAgent when no pages are open", async () => {
      const dir = storageDir();
      const ctx = {
        cookies: async () => [
          {
            name: "cf_clearance",
            value: "v",
            domain: ".example.com",
            path: "/",
            expires: Date.now() / 1000 + 3600,
            httpOnly: true,
            secure: true,
            sameSite: "None" as const,
          },
        ],
        pages: () => [],
      } as unknown as import("playwright").BrowserContext;

      await saveCookies(ctx, "no-pages", dir);

      const jar = await readCookieJar("no-pages", dir);
      expect(jar.hasCookies).toBe(true);
      expect(jar.userAgent).toBeUndefined();
    });

    it("does not write jar when no relevant cookies exist", async () => {
      const dir = storageDir();
      const ctx = mockContext([{ name: "irrelevant_cookie" }]);

      await saveCookies(ctx, "empty", dir);

      const jar = await readCookieJar("empty", dir);
      expect(jar.hasCookies).toBe(false);
    });
  });

  describe("invalidateCookies", () => {
    it("deletes the cookie file", async () => {
      const dir = storageDir();
      writeCookieJar(dir, "hiringcafe");
      const path = join(dir, "hiringcafe-cookies.json");
      expect(existsSync(path)).toBe(true);

      await invalidateCookies("hiringcafe", dir);
      expect(existsSync(path)).toBe(false);
    });

    it("does not throw when file does not exist", async () => {
      const dir = storageDir();
      await expect(
        invalidateCookies("nonexistent", dir),
      ).resolves.toBeUndefined();
    });

    it("makes readCookieJar return hasCookies false after invalidation", async () => {
      const dir = storageDir();
      writeCookieJar(dir, "hiringcafe", {
        userAgent: "Mozilla/5.0 SolverUA",
      });

      expect((await readCookieJar("hiringcafe", dir)).hasCookies).toBe(true);
      await invalidateCookies("hiringcafe", dir);
      expect((await readCookieJar("hiringcafe", dir)).hasCookies).toBe(false);
    });
  });
});
