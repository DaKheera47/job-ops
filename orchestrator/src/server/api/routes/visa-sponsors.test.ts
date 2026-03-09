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
      "@server/services/visa-sponsors/index"
    );
    vi.mocked(getStatus).mockResolvedValue({
      providers: [
        {
          providerId: "uk",
          countryKey: "united kingdom",
          lastUpdated: null,
          csvPath: null,
          totalSponsors: 0,
          isUpdating: false,
          nextScheduledUpdate: null,
          error: null,
        },
      ],
    });
    vi.mocked(downloadLatestCsv).mockResolvedValue({
      success: false,
      message: "failed",
    });

    const statusRes = await fetch(`${baseUrl}/api/visa-sponsors/status`);
    const statusBody = await statusRes.json();
    expect(statusBody.ok).toBe(true);
    expect(typeof statusBody.meta.requestId).toBe("string");
    expect(statusBody.data.providers).toHaveLength(1);
    expect(statusBody.data.providers[0].totalSponsors).toBe(0);

    const updateRes = await fetch(`${baseUrl}/api/visa-sponsors/update`, {
      method: "POST",
    });
    expect(updateRes.status).toBe(500);
    const updateBody = await updateRes.json();
    expect(updateBody.ok).toBe(false);
    expect(updateBody.error.code).toBe("INTERNAL_ERROR");
    expect(typeof updateBody.meta.requestId).toBe("string");
  });

  it("returns service unavailable when no visa sponsor providers are registered", async () => {
    const { downloadLatestCsv } = await import(
      "@server/services/visa-sponsors/index"
    );
    vi.mocked(downloadLatestCsv).mockResolvedValue({
      success: false,
      message: "No providers registered",
    });

    const res = await fetch(`${baseUrl}/api/visa-sponsors/update`, {
      method: "POST",
      headers: { "x-request-id": "req-visa-sponsors-empty" },
    });
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(res.headers.get("x-request-id")).toBe("req-visa-sponsors-empty");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.meta.requestId).toBe("req-visa-sponsors-empty");
  });

  it("validates search payloads and handles missing organizations", async () => {
    const { searchSponsors, getOrganizationDetails } = await import(
      "@server/services/visa-sponsors/index"
    );
    vi.mocked(searchSponsors).mockResolvedValue([
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
    vi.mocked(getOrganizationDetails).mockResolvedValue([]);

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
    expect(typeof body.meta.requestId).toBe("string");
    expect(body.data.total).toBe(1);

    const orgRes = await fetch(
      `${baseUrl}/api/visa-sponsors/organization/Acme`,
    );
    expect(orgRes.status).toBe(404);
  });
});
