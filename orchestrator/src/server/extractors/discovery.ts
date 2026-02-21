import type { Dirent } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ExtractorManifest } from "@shared/types";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_EXTRACTORS_ROOT = resolve(process.cwd(), "../extractors");
const MODULE_RELATIVE_EXTRACTORS_ROOT = resolve(
  moduleDir,
  "../../../../extractors",
);

const MANIFEST_CANDIDATES = ["manifest.ts", "src/manifest.ts"] as const;

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function resolveExtractorsRoot(): Promise<string> {
  if (await directoryExists(DEFAULT_EXTRACTORS_ROOT)) {
    return DEFAULT_EXTRACTORS_ROOT;
  }

  if (await directoryExists(MODULE_RELATIVE_EXTRACTORS_ROOT)) {
    return MODULE_RELATIVE_EXTRACTORS_ROOT;
  }

  return DEFAULT_EXTRACTORS_ROOT;
}

export async function discoverManifestPaths(
  extractorsRoot?: string,
): Promise<string[]> {
  const root = extractorsRoot ?? (await resolveExtractorsRoot());
  if (basename(root) !== "extractors") {
    return [];
  }

  let entries: Dirent[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    const known = error as NodeJS.ErrnoException;
    if (known.code === "ENOENT") return [];
    throw error;
  }
  const paths: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    for (const candidate of MANIFEST_CANDIDATES) {
      const fullPath = join(root, entry.name, candidate);
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
  const candidateManifest = (loaded as { manifest?: unknown }).manifest;
  const candidateDefault = (loaded as { default?: unknown }).default;
  const manifest = isManifest(candidateManifest)
    ? candidateManifest
    : candidateDefault;

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
