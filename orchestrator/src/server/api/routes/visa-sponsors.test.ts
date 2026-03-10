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
      code: "ALL_PROVIDER_UPDATES_FAILED",
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
      code: "NO_PROVIDERS_REGISTERED",
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

  it("updates an individual provider and returns its refreshed status", async () => {
    const { downloadLatestCsv, getStatus } = await import(
      "@server/services/visa-sponsors/index"
    );
    vi.mocked(downloadLatestCsv).mockResolvedValue({
      success: true,
      message: "Updated 1/1 providers",
    });
    vi.mocked(getStatus).mockResolvedValue({
      providers: [
        {
          providerId: "uk",
          countryKey: "united kingdom",
          lastUpdated: "2026-03-09T12:00:00.000Z",
          csvPath: "/tmp/uk/visa_sponsors_2026-03-09.csv",
          totalSponsors: 123,
          isUpdating: false,
          nextScheduledUpdate: "2026-03-10T02:00:00.000Z",
          error: null,
        },
      ],
    });

    const res = await fetch(`${baseUrl}/api/visa-sponsors/update/uk`, {
      method: "POST",
      headers: { "x-request-id": "req-visa-sponsors-uk" },
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-visa-sponsors-uk");
    expect(vi.mocked(downloadLatestCsv)).toHaveBeenCalledWith("uk");
    expect(body.ok).toBe(true);
    expect(body.data.message).toBe("Updated 1/1 providers");
    expect(body.data.status.providers).toHaveLength(1);
    expect(body.meta.requestId).toBe("req-visa-sponsors-uk");
  });

  it("returns not found when updating an unknown provider", async () => {
    const { downloadLatestCsv } = await import(
      "@server/services/visa-sponsors/index"
    );
    vi.mocked(downloadLatestCsv).mockResolvedValue({
      success: false,
      message: "Provider 'au' not found",
      code: "PROVIDER_NOT_FOUND",
    });

    const res = await fetch(`${baseUrl}/api/visa-sponsors/update/au`, {
      method: "POST",
      headers: { "x-request-id": "req-visa-sponsors-au" },
    });
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(res.headers.get("x-request-id")).toBe("req-visa-sponsors-au");
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Provider 'au' not found");
    expect(body.meta.requestId).toBe("req-visa-sponsors-au");
  });

  it("validates search payloads and handles missing organizations", async () => {
    const { searchSponsors, getOrganizationDetails } = await import(
      "@server/services/visa-sponsors/index"
    );
    vi.mocked(searchSponsors).mockResolvedValue([
      {
        providerId: "uk",
        countryKey: "united kingdom",
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
      `${baseUrl}/api/visa-sponsors/organization/Acme?providerId=uk`,
    );
    expect(orgRes.status).toBe(404);
  });

  it("rejects invalid provider ids before organization lookup", async () => {
    const { getOrganizationDetails } = await import(
      "@server/services/visa-sponsors/index"
    );

    const res = await fetch(
      `${baseUrl}/api/visa-sponsors/organization/Acme?providerId=../secrets`,
      {
        headers: { "x-request-id": "req-visa-sponsors-invalid-provider" },
      },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(res.headers.get("x-request-id")).toBe(
      "req-visa-sponsors-invalid-provider",
    );
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.message).toBe("Unknown provider '../secrets'");
    expect(body.meta.requestId).toBe("req-visa-sponsors-invalid-provider");
    expect(vi.mocked(getOrganizationDetails)).not.toHaveBeenCalled();
  });
});
