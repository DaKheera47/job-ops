import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "./test-utils.js";

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
    expect(body.success).toBe(true);
    expect(body.data.defaultModel).toBe("test-model");
    expect(Array.isArray(body.data.searchTerms)).toBe(true);
    expect(body.data.rxresumeEmail).toBe("resume@example.com");
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
    expect(patchBody.success).toBe(true);
    expect(patchBody.data.searchTerms).toEqual(["engineer"]);
    expect(patchBody.data.overrideSearchTerms).toEqual(["engineer"]);
    expect(patchBody.data.rxresumeEmail).toBe("updated@example.com");
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
    expect(body.success).toBe(false);
    expect(body.error).toContain("Username is required");
  });

  it("persists scanner enabled flag overrides", async () => {
    // First, disable gradcrackerEnabled and indeedEnabled
    const patchRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradcrackerEnabled: false,
        indeedEnabled: false,
      }),
    });
    const patchBody = await patchRes.json();
    expect(patchBody.success).toBe(true);
    expect(patchBody.data.gradcrackerEnabled).toBe(false);
    expect(patchBody.data.overrideGradcrackerEnabled).toBe(false);
    expect(patchBody.data.indeedEnabled).toBe(false);
    expect(patchBody.data.overrideIndeedEnabled).toBe(false);

    // Verify persistence with GET request
    const getRes = await fetch(`${baseUrl}/api/settings`);
    const getBody = await getRes.json();
    expect(getBody.success).toBe(true);
    expect(getBody.data.gradcrackerEnabled).toBe(false);
    expect(getBody.data.overrideGradcrackerEnabled).toBe(false);
    expect(getBody.data.indeedEnabled).toBe(false);
    expect(getBody.data.overrideIndeedEnabled).toBe(false);

    // Reset gradcrackerEnabled to default using null
    const resetRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gradcrackerEnabled: null,
      }),
    });
    const resetBody = await resetRes.json();
    expect(resetBody.success).toBe(true);
    expect(resetBody.data.gradcrackerEnabled).toBe(true); // returns to default (true)
    expect(resetBody.data.overrideGradcrackerEnabled).toBeNull(); // override cleared
  });
});
