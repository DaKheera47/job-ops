import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { ExtractorManifest } from "@shared/types";

const extractorsRoot = join(process.cwd(), "../extractors");

const MANIFEST_CANDIDATES = ["manifest.ts", "src/manifest.ts"] as const;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function discoverManifestPaths(): Promise<string[]> {
  const entries = await readdir(extractorsRoot, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    for (const candidate of MANIFEST_CANDIDATES) {
      const fullPath = join(extractorsRoot, entry.name, candidate);
      if (await fileExists(fullPath)) {
        paths.push(fullPath);
        break;
      }
    }
  }

  return paths.sort();
}

function isManifest(value: unknown): value is ExtractorManifest {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Partial<ExtractorManifest>;
  return (
    typeof manifest.id === "string" &&
    typeof manifest.displayName === "string" &&
    Array.isArray(manifest.providesSources) &&
    manifest.providesSources.every((source) => typeof source === "string") &&
    typeof manifest.run === "function"
  );
}

export async function loadManifestFromFile(
  path: string,
): Promise<ExtractorManifest> {
  const loaded = await import(pathToFileURL(path).href);
  const manifest = (loaded.default ?? loaded.manifest) as unknown;
  if (!isManifest(manifest)) {
    throw new Error(`Invalid manifest export in ${path}`);
  }

  return {
    ...manifest,
    providesSources: [...manifest.providesSources],
    requiredEnvVars: manifest.requiredEnvVars
      ? [...manifest.requiredEnvVars]
      : undefined,
  };
}
