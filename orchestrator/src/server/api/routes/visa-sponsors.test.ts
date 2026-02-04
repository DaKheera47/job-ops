import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

describe.sequential("Visa sponsors API routes", () => {
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

  it("returns status and surfaces update errors", async () => {
    const { getStatus, downloadLatestCsv } = await import(
      "../../services/visa-sponsors/index"
    );
    vi.mocked(getStatus).mockReturnValue({
      lastUpdated: null,
      csvPath: null,
      totalSponsors: 0,
      isUpdating: false,
      nextScheduledUpdate: null,
      error: null,
    });
    vi.mocked(downloadLatestCsv).mockResolvedValue({
      success: false,
      message: "failed",
    });

    const statusRes = await fetch(`${baseUrl}/api/visa-sponsors/status`);
    const statusBody = await statusRes.json();
    expect(statusBody.ok).toBe(true);
    expect(statusBody.data.totalSponsors).toBe(0);

    const updateRes = await fetch(`${baseUrl}/api/visa-sponsors/update`, {
      method: "POST",
    });
    expect(updateRes.status).toBe(500);
  });

  it("validates search payloads and handles missing organizations", async () => {
    const { searchSponsors, getOrganizationDetails } = await import(
      "../../services/visa-sponsors/index"
    );
    vi.mocked(searchSponsors).mockReturnValue([
      {
        sponsor: {
          organisationName: "Acme",
          townCity: "London",
          county: "London",
          typeRating: "Worker",
          route: "Skilled",
        },
        score: 95,
        matchedName: "acme",
      },
    ]);
    vi.mocked(getOrganizationDetails).mockReturnValue([]);

    const badRes = await fetch(`${baseUrl}/api/visa-sponsors/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(badRes.status).toBe(400);

    const res = await fetch(`${baseUrl}/api/visa-sponsors/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Acme" }),
    });
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.total).toBe(1);

    const orgRes = await fetch(
      `${baseUrl}/api/visa-sponsors/organization/Acme`,
    );
    expect(orgRes.status).toBe(404);
  });
});
