import { readdir, readFile } from "node:fs/promises";
import type { Server } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

const routesDir = dirname(fileURLToPath(import.meta.url));

async function getRouteSourceFiles(): Promise<string[]> {
  const entries = await readdir(routesDir, { withFileTypes: true });
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".test.ts") &&
        entry.name !== "test-utils.ts",
    )
    .map((entry) => join(routesDir, entry.name))
    .sort();
}

describe("API contract guardrails", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("returns structured 404 responses with an echoed request id", async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`, {
      headers: { "x-request-id": "req-api-contract-404" },
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(res.headers.get("x-request-id")).toBe("req-api-contract-404");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.meta.requestId).toBe("req-api-contract-404");
  });

  it("prevents direct JSON response bodies in API route handlers", async () => {
    const routeFiles = await getRouteSourceFiles();
    const directJsonOffenders: string[] = [];
    const legacySuccessOffenders: string[] = [];

    for (const file of routeFiles) {
      const source = await readFile(file, "utf8");
      if (/res\s*(?:\.\s*status\s*\([^)]*\))?\s*\.\s*json\s*\(/.test(source)) {
        directJsonOffenders.push(file);
      }
      if (/\bsuccess\s*:/.test(source)) {
        legacySuccessOffenders.push(file);
      }
    }

    expect(directJsonOffenders).toEqual([]);
    expect(legacySuccessOffenders).toEqual([]);
  });
});
