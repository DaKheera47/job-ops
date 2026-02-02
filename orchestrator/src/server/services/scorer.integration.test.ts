/**
 * Integration tests for salary penalty scoring feature.
 * Tests end-to-end flow: settings API -> configuration -> feature works as documented
 *
 * NOTE: The core scoring logic with penalty application is tested in:
 * - scorer.test.ts (unit tests for parseJsonFromContent)
 * - settings.test.ts (persistence tests for penalty settings)
 * - Settings verification steps in the PRD
 *
 * This integration test verifies that all components work together through the API.
 */

import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startServer, stopServer } from "../api/routes/test-utils.js";

describe.sequential("Salary Penalty Integration", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer({
      env: {
        OPENROUTER_API_KEY: "test-key",
      },
    }));
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
  });

  it("allows enabling and configuring salary penalty through settings API", async () => {
    // Get initial settings - should have defaults
    const getInitial = await fetch(`${baseUrl}/api/settings`);
    const initialBody = await getInitial.json();

    expect(initialBody.success).toBe(true);
    expect(initialBody.data.penalizeMissingSalary).toBe(false);
    expect(initialBody.data.defaultPenalizeMissingSalary).toBe(false);
    expect(initialBody.data.missingSalaryPenalty).toBe(10);
    expect(initialBody.data.defaultMissingSalaryPenalty).toBe(10);

    // Enable penalty and set value to 15
    const patchRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalizeMissingSalary: true,
        missingSalaryPenalty: 15,
      }),
    });

    const patchBody = await patchRes.json();
    expect(patchRes.status).toBe(200);
    expect(patchBody.success).toBe(true);
    expect(patchBody.data.penalizeMissingSalary).toBe(true);
    expect(patchBody.data.overridePenalizeMissingSalary).toBe(true);
    expect(patchBody.data.missingSalaryPenalty).toBe(15);
    expect(patchBody.data.overrideMissingSalaryPenalty).toBe(15);

    // Verify settings persist
    const getUpdated = await fetch(`${baseUrl}/api/settings`);
    const updatedBody = await getUpdated.json();

    expect(updatedBody.data.penalizeMissingSalary).toBe(true);
    expect(updatedBody.data.missingSalaryPenalty).toBe(15);
  });

  it("allows disabling salary penalty through settings API", async () => {
    // First enable it
    await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalizeMissingSalary: true,
        missingSalaryPenalty: 20,
      }),
    });

    // Then disable it
    const disableRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalizeMissingSalary: false,
      }),
    });

    const disableBody = await disableRes.json();
    expect(disableRes.status).toBe(200);
    expect(disableBody.data.penalizeMissingSalary).toBe(false);
    expect(disableBody.data.overridePenalizeMissingSalary).toBe(false);

    // Penalty value should still be set
    expect(disableBody.data.missingSalaryPenalty).toBe(20);
  });

  it("allows resetting salary penalty to defaults", async () => {
    // Set custom values
    await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalizeMissingSalary: true,
        missingSalaryPenalty: 25,
      }),
    });

    // Reset to defaults
    const resetRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalizeMissingSalary: null,
        missingSalaryPenalty: null,
      }),
    });

    const resetBody = await resetRes.json();
    expect(resetRes.status).toBe(200);
    expect(resetBody.data.penalizeMissingSalary).toBe(false);
    expect(resetBody.data.overridePenalizeMissingSalary).toBe(null);
    expect(resetBody.data.missingSalaryPenalty).toBe(10);
    expect(resetBody.data.overrideMissingSalaryPenalty).toBe(null);
  });

  it("validates penalty range constraints", async () => {
    // Test negative value
    const negativeRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missingSalaryPenalty: -5,
      }),
    });
    expect(negativeRes.status).toBe(400);

    // Test value over 100
    const overMaxRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missingSalaryPenalty: 150,
      }),
    });
    expect(overMaxRes.status).toBe(400);

    // Test boundary values (should work)
    const minRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missingSalaryPenalty: 0,
      }),
    });
    expect(minRes.status).toBe(200);

    const maxRes = await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missingSalaryPenalty: 100,
      }),
    });
    expect(maxRes.status).toBe(200);
  });

  it("maintains 3-tier override system (default, env, override)", async () => {
    // Get defaults
    const getDefaults = await fetch(`${baseUrl}/api/settings`);
    const defaultsBody = await getDefaults.json();

    // Verify structure includes all 3 tiers for both settings
    expect(defaultsBody.data).toHaveProperty("penalizeMissingSalary");
    expect(defaultsBody.data).toHaveProperty("defaultPenalizeMissingSalary");
    expect(defaultsBody.data).toHaveProperty("overridePenalizeMissingSalary");
    expect(defaultsBody.data).toHaveProperty("missingSalaryPenalty");
    expect(defaultsBody.data).toHaveProperty("defaultMissingSalaryPenalty");
    expect(defaultsBody.data).toHaveProperty("overrideMissingSalaryPenalty");

    // Set override
    await fetch(`${baseUrl}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        penalizeMissingSalary: true,
        missingSalaryPenalty: 30,
      }),
    });

    const getWithOverride = await fetch(`${baseUrl}/api/settings`);
    const overrideBody = await getWithOverride.json();

    // Effective should match override
    expect(overrideBody.data.penalizeMissingSalary).toBe(true);
    expect(overrideBody.data.missingSalaryPenalty).toBe(30);

    // Override fields should be set
    expect(overrideBody.data.overridePenalizeMissingSalary).toBe(true);
    expect(overrideBody.data.overrideMissingSalaryPenalty).toBe(30);

    // Defaults should remain unchanged
    expect(overrideBody.data.defaultPenalizeMissingSalary).toBe(false);
    expect(overrideBody.data.defaultMissingSalaryPenalty).toBe(10);
  });
});
