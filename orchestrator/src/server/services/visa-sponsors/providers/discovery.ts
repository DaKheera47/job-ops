import type { Dirent } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { VisaSponsorProviderManifest } from "@shared/types";

const moduleDir = dirname(fileURLToPath(import.meta.url));

// This file lives at:
//   orchestrator/src/server/services/visa-sponsors/providers/discovery.ts
// Going up 6 levels reaches the repo root.
const DEFAULT_PROVIDERS_ROOT = resolve(
  process.cwd(),
  "../visa-sponsor-providers",
);
const MODULE_RELATIVE_PROVIDERS_ROOT = resolve(
  moduleDir,
  "../../../../../../visa-sponsor-providers",
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

async function resolveProvidersRoot(): Promise<string> {
  if (await directoryExists(DEFAULT_PROVIDERS_ROOT)) {
    return DEFAULT_PROVIDERS_ROOT;
  }

  if (await directoryExists(MODULE_RELATIVE_PROVIDERS_ROOT)) {
    return MODULE_RELATIVE_PROVIDERS_ROOT;
  }

  return DEFAULT_PROVIDERS_ROOT;
}

export async function discoverProviderManifestPaths(
  providersRoot?: string,
): Promise<string[]> {
  const root = providersRoot ?? (await resolveProvidersRoot());
  if (basename(root) !== "visa-sponsor-providers") {
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

function isProviderManifest(
  value: unknown,
): value is VisaSponsorProviderManifest {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<VisaSponsorProviderManifest>;
  return (
    typeof m.id === "string" &&
    typeof m.displayName === "string" &&
    typeof m.countryKey === "string" &&
    typeof m.fetchSponsors === "function"
  );
}

export async function loadProviderManifestFromFile(
  path: string,
): Promise<VisaSponsorProviderManifest> {
  const loaded = await import(pathToFileURL(path).href);
  const candidateManifest = (loaded as { manifest?: unknown }).manifest;
  const candidateDefault = (loaded as { default?: unknown }).default;
  const manifest = isProviderManifest(candidateManifest)
    ? candidateManifest
    : candidateDefault;

  if (!isProviderManifest(manifest)) {
    throw new Error(`Invalid visa sponsor provider manifest in ${path}`);
  }

  return manifest;
}
