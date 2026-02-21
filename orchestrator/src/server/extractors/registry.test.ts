import type { ExtractorManifest } from "@shared/types";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./discovery", () => ({
  discoverManifestPaths: vi.fn(),
  loadManifestFromFile: vi.fn(),
}));

describe("extractor registry", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.EXTRACTOR_REGISTRY_STRICT = "false";
    const module = await import("./registry");
    module.__resetExtractorRegistryForTests();
  });

  it("loads manifests and maps sources", async () => {
    const discovery = await import("./discovery");
    const registryModule = await import("./registry");
    registryModule.__resetExtractorRegistryForTests();

    vi.mocked(discovery.discoverManifestPaths).mockResolvedValue([
      "/tmp/jobspy.ts",
      "/tmp/ukvisajobs.ts",
    ]);

    const manifests = new Map<string, ExtractorManifest>([
      [
        "/tmp/jobspy.ts",
        {
          id: "jobspy",
          displayName: "JobSpy",
          providesSources: ["indeed", "linkedin", "glassdoor"],
          run: vi.fn(),
        },
      ],
      [
        "/tmp/ukvisajobs.ts",
        {
          id: "ukvisajobs",
          displayName: "UK Visa Jobs",
          providesSources: ["ukvisajobs"],
          run: vi.fn(),
        },
      ],
    ]);

    vi.mocked(discovery.loadManifestFromFile).mockImplementation(
      async (path) => manifests.get(path) as ExtractorManifest,
    );

    const registry = await registryModule.initializeExtractorRegistry();

    expect(registry.manifests.size).toBe(2);
    expect(registry.manifestBySource.get("linkedin")?.id).toBe("jobspy");
    expect(registry.manifestBySource.get("ukvisajobs")?.id).toBe("ukvisajobs");
  });
});
