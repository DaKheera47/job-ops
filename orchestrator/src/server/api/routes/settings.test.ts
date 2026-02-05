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

  it("persists salary penalty settings and handles reset to defaults", async () => {
    // Get initial settings - should have defaults
    const getInitial = await fetch(`${baseUrl}/api/settings`);
    const initialBody = await getInitial.json();
    expect(initialBody.success).toBe(true);
    expect(initialBody.data.penalizeMissingSalary).toBe(false);
    expect(initialBody.data.defaultPenalizeMissingSalary).toBe(false);
    expect(initialBody.data.overridePenalizeMissingSalary).toBe(null);
    expect(initialBody.data.missingSalaryPenalty).toBe(10);
    expect(initialBody.data.defaultMissingSalaryPenalty).toBe(10);
    expect(initialBody.data.overrideMissingSalaryPenalty).toBe(null);

    // Update settings with valid values
    const patchRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalizeMissingSalary: true,
        missingSalaryPenalty: 15,
      }),
    });
    const patchBody = await patchRes.json();
    expect(patchBody.success).toBe(true);
    expect(patchBody.data.penalizeMissingSalary).toBe(true);
    expect(patchBody.data.overridePenalizeMissingSalary).toBe(true);
    expect(patchBody.data.missingSalaryPenalty).toBe(15);
    expect(patchBody.data.overrideMissingSalaryPenalty).toBe(15);

    // Verify settings persist on subsequent GET
    const getUpdated = await fetch(`${baseUrl}/api/settings`);
    const updatedBody = await getUpdated.json();
    expect(updatedBody.success).toBe(true);
    expect(updatedBody.data.penalizeMissingSalary).toBe(true);
    expect(updatedBody.data.overridePenalizeMissingSalary).toBe(true);
    expect(updatedBody.data.missingSalaryPenalty).toBe(15);
    expect(updatedBody.data.overrideMissingSalaryPenalty).toBe(15);

    // Reset to defaults by setting to null
    const resetRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalizeMissingSalary: null,
        missingSalaryPenalty: null,
      }),
    });
    const resetBody = await resetRes.json();
    expect(resetBody.success).toBe(true);
    expect(resetBody.data.penalizeMissingSalary).toBe(false);
    expect(resetBody.data.overridePenalizeMissingSalary).toBe(null);
    expect(resetBody.data.missingSalaryPenalty).toBe(10);
    expect(resetBody.data.overrideMissingSalaryPenalty).toBe(null);

    // Verify reset persists
    const getFinal = await fetch(`${baseUrl}/api/settings`);
    const finalBody = await getFinal.json();
    expect(finalBody.success).toBe(true);
    expect(finalBody.data.penalizeMissingSalary).toBe(false);
    expect(finalBody.data.overridePenalizeMissingSalary).toBe(null);
    expect(finalBody.data.missingSalaryPenalty).toBe(10);
    expect(finalBody.data.overrideMissingSalaryPenalty).toBe(null);
  });

  it("validates salary penalty range constraints", async () => {
    // Test negative value
    const negativeRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missingSalaryPenalty: -5,
      }),
    });
    expect(negativeRes.status).toBe(400);

    // Test over 100
    const tooHighRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missingSalaryPenalty: 150,
      }),
    });
    expect(tooHighRes.status).toBe(400);

    // Test valid boundary values
    const validRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missingSalaryPenalty: 0,
      }),
    });
    const validBody = await validRes.json();
    expect(validBody.success).toBe(true);
    expect(validBody.data.missingSalaryPenalty).toBe(0);

    const valid100Res = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missingSalaryPenalty: 100,
      }),
    });
    const valid100Body = await valid100Res.json();
    expect(valid100Body.success).toBe(true);
    expect(valid100Body.data.missingSalaryPenalty).toBe(100);
  });
});
