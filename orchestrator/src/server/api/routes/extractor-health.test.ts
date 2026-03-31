import type { Server } from "node:http";
import type { ExtractorRegistry } from "@server/extractors/registry";
import type { ExtractorSourceId } from "@shared/extractors";
import type { ExtractorManifest } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startServer, stopServer } from "./test-utils";

const mockGetExtractorRegistry = vi.fn();

vi.mock("@server/extractors/registry", () => ({
  getExtractorRegistry: mockGetExtractorRegistry,
}));

function createRegistry(
  manifests: ExtractorManifest[],
  availableSources?: ExtractorSourceId[],
): ExtractorRegistry {
  const manifestBySource = new Map<ExtractorSourceId, ExtractorManifest>();

  for (const manifest of manifests) {
    for (const source of manifest.providesSources) {
      manifestBySource.set(source as ExtractorSourceId, manifest);
    }
  }

  return {
    manifests: new Map(manifests.map((manifest) => [manifest.id, manifest])),
    manifestBySource,
    availableSources:
      availableSources ?? Array.from(manifestBySource.keys()).sort(),
  };
}

describe.sequential("Extractor health API routes", () => {
  let server: Server;
  let baseUrl: string;
  let closeDb: () => void;
  let tempDir: string;

  beforeEach(async () => {
    ({ server, baseUrl, closeDb, tempDir } = await startServer());
  });

  afterEach(async () => {
    await stopServer({ server, closeDb, tempDir });
    const module = await import("@server/services/extractor-health");
    module.__resetExtractorHealthCacheForTests();
    vi.clearAllMocks();
  });

  it("returns healthy extractor status with request metadata", async () => {
    const manifest: ExtractorManifest = {
      id: "jobspy",
      displayName: "JobSpy",
      providesSources: ["indeed", "linkedin", "glassdoor"],
      run: vi.fn().mockResolvedValue({
        success: true,
        jobs: [
          {
            source: "linkedin",
            title: "Software Engineer",
            employer: "Acme",
            jobUrl: "https://example.com/jobs/1",
          },
        ],
      }),
    };
    mockGetExtractorRegistry.mockResolvedValue(createRegistry([manifest]));

    const res = await fetch(`${baseUrl}/api/linkedin/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data.status).toBe("healthy");
    expect(body.data.source).toBe("linkedin");
    expect(body.data.cached).toBe(false);
    expect(typeof body.meta.requestId).toBe("string");
  });

  it("returns service unavailable when the extractor run fails", async () => {
    const manifest: ExtractorManifest = {
      id: "gradcracker",
      displayName: "Gradcracker",
      providesSources: ["gradcracker"],
      run: vi.fn().mockResolvedValue({
        success: false,
        jobs: [],
        error: "crawler unavailable",
      }),
    };
    mockGetExtractorRegistry.mockResolvedValue(createRegistry([manifest]));

    const res = await fetch(`${baseUrl}/api/gradcracker/health`);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.error.message).toMatch(/crawler unavailable/i);
    expect(body.error.details.status).toBe("unhealthy");
  });

  it("returns service unavailable when zero jobs are returned", async () => {
    const manifest: ExtractorManifest = {
      id: "workingnomads",
      displayName: "Working Nomads",
      providesSources: ["workingnomads"],
      run: vi.fn().mockResolvedValue({
        success: true,
        jobs: [],
      }),
    };
    mockGetExtractorRegistry.mockResolvedValue(createRegistry([manifest]));

    const res = await fetch(`${baseUrl}/api/workingnomads/health`);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.message).toMatch(/returned no jobs/i);
  });

  it("returns service unavailable when jobs fail validation", async () => {
    const manifest: ExtractorManifest = {
      id: "jobspy",
      displayName: "JobSpy",
      providesSources: ["indeed", "linkedin", "glassdoor"],
      run: vi.fn().mockResolvedValue({
        success: true,
        jobs: [
          {
            source: "indeed",
            title: "",
            employer: "Wrong Source",
            jobUrl: "https://example.com/jobs/bad",
          },
        ],
      }),
    };
    mockGetExtractorRegistry.mockResolvedValue(createRegistry([manifest]));

    const res = await fetch(`${baseUrl}/api/linkedin/health`);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.ok).toBe(false);
    expect(body.error.message).toMatch(/none passed validation/i);
    expect(body.error.details.jobsValidated).toBe(0);
  });

  it("returns not found for unknown and unavailable runtime sources", async () => {
    mockGetExtractorRegistry.mockResolvedValue(createRegistry([]));

    const unknownRes = await fetch(`${baseUrl}/api/not-a-source/health`);
    const unknownBody = await unknownRes.json();
    expect(unknownRes.status).toBe(404);
    expect(unknownBody.ok).toBe(false);
    expect(unknownBody.error.code).toBe("NOT_FOUND");

    const unavailableRes = await fetch(`${baseUrl}/api/manual/health`);
    const unavailableBody = await unavailableRes.json();
    expect(unavailableRes.status).toBe(404);
    expect(unavailableBody.ok).toBe(false);
    expect(unavailableBody.error.message).toMatch(/not available at runtime/i);
  });
});
