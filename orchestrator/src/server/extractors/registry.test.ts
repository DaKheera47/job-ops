import { logger } from "@infra/logger";
import type { ExtractorManifest } from "@shared/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./discovery", () => ({
  discoverManifestPaths: vi.fn(),
  loadManifestFromFile: vi.fn(),
}));

function makeManifest(
  id: string,
  sources: string[],
  displayName = id,
): ExtractorManifest {
  return {
    id,
    displayName,
    providesSources: sources,
    run: vi.fn(),
  };
}

describe("extractor registry", () => {
  let previousStrict: string | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    previousStrict = process.env.EXTRACTOR_REGISTRY_STRICT;
    process.env.EXTRACTOR_REGISTRY_STRICT = "false";
    const module = await import("./registry");
    module.__resetExtractorRegistryForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousStrict === undefined) {
      delete process.env.EXTRACTOR_REGISTRY_STRICT;
      return;
    }
    process.env.EXTRACTOR_REGISTRY_STRICT = previousStrict;
  });

  it("loads manifests and maps sources", async () => {
    const discovery = await import("./discovery");
    const registryModule = await import("./registry");
    registryModule.__resetExtractorRegistryForTests();

    vi.mocked(discovery.discoverManifestPaths).mockResolvedValue([
      "/tmp/jobspy.ts",
      "/tmp/ukvisajobs.ts",
    ]);
    vi.mocked(discovery.loadManifestFromFile).mockImplementation(
      async (path) =>
        path === "/tmp/jobspy.ts"
          ? makeManifest(
              "jobspy",
              ["indeed", "linkedin", "glassdoor"],
              "JobSpy",
            )
          : makeManifest("ukvisajobs", ["ukvisajobs"], "UK Visa Jobs"),
    );

    const registry = await registryModule.initializeExtractorRegistry();

    expect(registry.manifests.size).toBe(2);
    expect(registry.manifestBySource.get("linkedin")?.id).toBe("jobspy");
    expect(registry.manifestBySource.get("ukvisajobs")?.id).toBe("ukvisajobs");
  });

  it("throws on duplicate manifest ids in strict mode", async () => {
    const discovery = await import("./discovery");
    const registryModule = await import("./registry");
    registryModule.__resetExtractorRegistryForTests();
    process.env.EXTRACTOR_REGISTRY_STRICT = "true";

    vi.mocked(discovery.discoverManifestPaths).mockResolvedValue([
      "/tmp/one.ts",
      "/tmp/two.ts",
    ]);
    vi.mocked(discovery.loadManifestFromFile).mockImplementation(async (path) =>
      makeManifest(
        "duplicate",
        path === "/tmp/one.ts" ? ["indeed"] : ["linkedin"],
        `Manifest ${path}`,
      ),
    );

    await expect(registryModule.initializeExtractorRegistry()).rejects.toThrow(
      "Duplicate extractor manifest id: duplicate",
    );
  });

  it("throws on duplicate source providers even in non-strict mode", async () => {
    const discovery = await import("./discovery");
    const registryModule = await import("./registry");
    registryModule.__resetExtractorRegistryForTests();
    process.env.EXTRACTOR_REGISTRY_STRICT = "false";

    vi.mocked(discovery.discoverManifestPaths).mockResolvedValue([
      "/tmp/one.ts",
      "/tmp/two.ts",
    ]);
    vi.mocked(discovery.loadManifestFromFile).mockImplementation(
      async (path) =>
        path === "/tmp/one.ts"
          ? makeManifest("one", ["indeed"], "One")
          : makeManifest("two", ["indeed"], "Two"),
    );

    await expect(registryModule.initializeExtractorRegistry()).rejects.toThrow(
      "Source indeed is provided by multiple manifests (one, two)",
    );
  });

  it("warns and skips manifests with unknown sources", async () => {
    const discovery = await import("./discovery");
    const registryModule = await import("./registry");
    registryModule.__resetExtractorRegistryForTests();
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    vi.mocked(discovery.discoverManifestPaths).mockResolvedValue([
      "/tmp/unknown.ts",
      "/tmp/valid.ts",
    ]);
    vi.mocked(discovery.loadManifestFromFile).mockImplementation(
      async (path) =>
        path === "/tmp/unknown.ts"
          ? makeManifest("unknown", ["not-a-real-source"], "Unknown")
          : makeManifest("valid", ["indeed"], "Valid"),
    );

    const registry = await registryModule.initializeExtractorRegistry();

    expect(registry.manifests.size).toBe(1);
    expect(registry.manifests.has("valid")).toBe(true);
    expect(
      warnSpy.mock.calls.some(
        ([message]) =>
          typeof message === "string" &&
          message.includes("Skipping extractor manifest with no known sources"),
      ),
    ).toBe(true);
  });

  it("warns when catalog pipeline sources have no runtime manifest", async () => {
    const discovery = await import("./discovery");
    const registryModule = await import("./registry");
    registryModule.__resetExtractorRegistryForTests();
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});

    vi.mocked(discovery.discoverManifestPaths).mockResolvedValue([
      "/tmp/only-indeed.ts",
    ]);
    vi.mocked(discovery.loadManifestFromFile).mockResolvedValue(
      makeManifest("only-indeed", ["indeed"], "Only Indeed"),
    );

    await registryModule.initializeExtractorRegistry();

    expect(
      warnSpy.mock.calls.some(
        ([message]) =>
          typeof message === "string" &&
          message.includes("Shared extractor sources have no runtime manifest"),
      ),
    ).toBe(true);
  });

  it("continues loading valid manifests in non-strict mode when one manifest fails", async () => {
    const discovery = await import("./discovery");
    const registryModule = await import("./registry");
    registryModule.__resetExtractorRegistryForTests();
    process.env.EXTRACTOR_REGISTRY_STRICT = "false";

    vi.mocked(discovery.discoverManifestPaths).mockResolvedValue([
      "/tmp/broken.ts",
      "/tmp/valid.ts",
    ]);
    vi.mocked(discovery.loadManifestFromFile).mockImplementation(
      async (path) => {
        if (path === "/tmp/broken.ts") {
          throw new Error("bad manifest");
        }
        return makeManifest("valid", ["indeed"], "Valid");
      },
    );

    const registry = await registryModule.initializeExtractorRegistry();

    expect(registry.manifests.size).toBe(1);
    expect(registry.manifests.has("valid")).toBe(true);
    expect(registry.manifestBySource.get("indeed")?.id).toBe("valid");
  });
});
