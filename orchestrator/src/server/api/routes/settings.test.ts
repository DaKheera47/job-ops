import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Settings API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        OPENROUTER_API_KEY: "secret-key",
        RXRESUME_EMAIL: "resume@example.com",
      },
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("returns settings with defaults", async () => {
    const res = await fetch(`${baseUrl}/api/settings`);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.defaultModel).toBe("test-model");
    expect(Array.isArray(body.data.searchTerms)).toBe(true);
    expect(body.data.rxresumeEmail).toBe("resume@example.com");
    expect(body.data.llmApiKeyHint).toBe("secr");
    expect(body.data.openrouterApiKeyHint).toBe("secr");
    expect(body.data.basicAuthActive).toBe(false);
  });

  it("rejects invalid settings updates and persists overrides", async () => {
    const badPatch = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobspyResultsWanted: 9999 }),
    });
    expect(badPatch.status).toBe(400);

    const patchRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchTerms: ["engineer"],
        rxresumeEmail: "updated@example.com",
        openrouterApiKey: "updated-secret",
      }),
    });
    const patchBody = await patchRes.json();
    expect(patchBody.ok).toBe(true);
    expect(patchBody.data.searchTerms).toEqual(["engineer"]);
    expect(patchBody.data.overrideSearchTerms).toEqual(["engineer"]);
    expect(patchBody.data.rxresumeEmail).toBe("updated@example.com");
    expect(patchBody.data.llmApiKeyHint).toBe("upda");
    expect(patchBody.data.openrouterApiKeyHint).toBe("upda");
  });

  it("validates basic auth requirements", async () => {
    const res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enableBasicAuth: true,
        basicAuthUser: "",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error.message).toContain("Username is required");
  });

  it("handles salary penalty settings with validation", async () => {
    // Get initial settings
    const initialRes = await fetch(`${baseUrl}/api/settings`);
    const initialBody = await initialRes.json();
    expect(initialBody.ok).toBe(true);
    expect(initialBody.data.penalizeMissingSalary).toBe(false);
    expect(initialBody.data.missingSalaryPenalty).toBe(10);

    // Test invalid penalty values
    const invalidRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missingSalaryPenalty: 150 }),
    });
    expect(invalidRes.status).toBe(400);

    const negativeRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missingSalaryPenalty: -10 }),
    });
    expect(negativeRes.status).toBe(400);

    // Test valid settings update
    const validRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalizeMissingSalary: true,
        missingSalaryPenalty: 20,
      }),
    });
    const validBody = await validRes.json();
    expect(validBody.ok).toBe(true);
    expect(validBody.data.penalizeMissingSalary).toBe(true);
    expect(validBody.data.overridePenalizeMissingSalary).toBe(true);
    expect(validBody.data.missingSalaryPenalty).toBe(20);
    expect(validBody.data.overrideMissingSalaryPenalty).toBe(20);

    // Verify persistence
    const getRes = await fetch(`${baseUrl}/api/settings`);
    const getBody = await getRes.json();
    expect(getBody.ok).toBe(true);
    expect(getBody.data.penalizeMissingSalary).toBe(true);
    expect(getBody.data.missingSalaryPenalty).toBe(20);
  });
});
