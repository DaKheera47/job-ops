import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverManifestPaths, loadManifestFromFile } from "./discovery";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const testTmpBase = join(process.cwd(), "orchestrator", ".tmp");
  await mkdir(testTmpBase, { recursive: true });
  const tempDir = await mkdtemp(join(testTmpBase, "extractor-discovery-"));
  const root = join(tempDir, "extractors");
  await mkdir(root, { recursive: true });
  tempRoots.push(tempDir);
  return root;
}

afterEach(async () => {
  for (const root of tempRoots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

describe("extractor discovery", () => {
  it("finds manifest.ts and src/manifest.ts files", async () => {
    const root = await makeTempRoot();
    await mkdir(join(root, "adzuna", "src"), { recursive: true });
    await mkdir(join(root, "jobspy"), { recursive: true });

    await writeFile(
      join(root, "adzuna", "src", "manifest.ts"),
      "export const manifest = { id: 'adzuna', displayName: 'Adzuna', providesSources: ['adzuna'], async run() { return { success: true, jobs: [] }; } };",
      "utf8",
    );
    await writeFile(
      join(root, "jobspy", "manifest.ts"),
      "export default { id: 'jobspy', displayName: 'JobSpy', providesSources: ['indeed'], async run() { return { success: true, jobs: [] }; } };",
      "utf8",
    );

    const found = await discoverManifestPaths(root);

    expect(found).toEqual([
      join(root, "adzuna", "src", "manifest.ts"),
      join(root, "jobspy", "manifest.ts"),
    ]);
  });

  it("returns empty list when extractor root does not exist", async () => {
    const root = join(tmpdir(), `missing-extractors-${Date.now()}`);
    await expect(discoverManifestPaths(root)).resolves.toEqual([]);
  });

  it("returns empty list when root is not named extractors", async () => {
    const root = await makeTempRoot();
    const invalidRoot = join(root, "..");
    await expect(discoverManifestPaths(invalidRoot)).resolves.toEqual([]);
  });

  it("loads and validates manifest modules", async () => {
    const root = await makeTempRoot();
    const validPath = join(root, "valid-manifest.mjs");
    await writeFile(
      validPath,
      "export const manifest = { id: 'valid', displayName: 'Valid', providesSources: ['indeed'], requiredEnvVars: ['A'], async run() { return { success: true, jobs: [] }; } };",
      "utf8",
    );

    const manifest = await loadManifestFromFile(validPath);
    expect(manifest.id).toBe("valid");
    expect(manifest.providesSources).toEqual(["indeed"]);
    expect(manifest.requiredEnvVars).toEqual(["A"]);
  });

  it("prefers named manifest export when default is a wrapper object", async () => {
    const root = await makeTempRoot();
    const wrappedPath = join(root, "wrapped-manifest.mjs");
    await writeFile(
      wrappedPath,
      [
        "const valid = { id: 'wrapped', displayName: 'Wrapped', providesSources: ['indeed'], async run() { return { success: true, jobs: [] }; } };",
        "export const manifest = valid;",
        "export default { default: valid, manifest: valid };",
      ].join("\n"),
      "utf8",
    );

    const manifest = await loadManifestFromFile(wrappedPath);
    expect(manifest.id).toBe("wrapped");
    expect(manifest.providesSources).toEqual(["indeed"]);
  });

  it("throws for invalid manifest exports", async () => {
    const root = await makeTempRoot();
    const invalidPath = join(root, "invalid-manifest.mjs");
    await writeFile(
      invalidPath,
      "export default { id: 'invalid', displayName: 'Invalid', providesSources: ['indeed'] };",
      "utf8",
    );

    await expect(loadManifestFromFile(invalidPath)).rejects.toThrow(
      "Invalid manifest export",
    );
  });
});
