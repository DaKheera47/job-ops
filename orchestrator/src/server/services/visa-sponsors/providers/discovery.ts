import type { Dirent } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import type { VisaSponsorProviderManifest } from "@shared/types";

const moduleDir = dirname(fileURLToPath(import.meta.url));

function getProvidersRootCandidates(): string[] {
  return [
    resolve(process.cwd(), "visa-sponsor-providers"),
    resolve(process.cwd(), "../visa-sponsor-providers"),
    resolve(moduleDir, "../../../../../../visa-sponsor-providers"),
  ];
}

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
  const candidates = getProvidersRootCandidates();

  for (const candidate of candidates) {
    if (await directoryExists(candidate)) {
      logger.info("Resolved visa sponsor providers root", {
        selectedRoot: candidate,
        candidates,
      });
      return candidate;
    }
  }

  logger.warn(
    "No visa sponsor providers root exists; using default candidate",
    {
      selectedRoot: candidates[0],
      candidates,
    },
  );
  return candidates[0];
}

export async function discoverProviderManifestPaths(
  providersRoot?: string,
): Promise<string[]> {
  const root = providersRoot ?? (await resolveProvidersRoot());
  if (basename(root) !== "visa-sponsor-providers") {
    logger.warn(
      "Visa sponsor providers root rejected due to unexpected basename",
      {
        root,
      },
    );
    return [];
  }

  let entries: Dirent[] = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    const known = error as NodeJS.ErrnoException;
    if (known.code === "ENOENT") return [];
    logger.warn("Failed to read visa sponsor providers root", {
      root,
      error: sanitizeUnknown(error),
    });
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

  const sortedPaths = paths.sort();
  logger.info("Discovered visa sponsor provider manifest paths", {
    root,
    manifestCount: sortedPaths.length,
    manifestPaths: sortedPaths,
  });

  return sortedPaths;
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
  const fileUrl = pathToFileURL(path).href;
  logger.info("Loading visa sponsor provider manifest", {
    path,
    fileUrl,
  });

  let loaded: unknown;
  try {
    loaded = await import(fileUrl);
  } catch (error) {
    logger.warn("Failed to import visa sponsor provider manifest", {
      path,
      fileUrl,
      error: sanitizeUnknown(error),
    });
    throw error;
  }

  const candidateManifest = (loaded as { manifest?: unknown }).manifest;
  const candidateDefault = (loaded as { default?: unknown }).default;
  const manifest = isProviderManifest(candidateManifest)
    ? candidateManifest
    : candidateDefault;

  if (!isProviderManifest(manifest)) {
    logger.warn("Visa sponsor provider manifest export shape is invalid", {
      path,
      fileUrl,
      exportedKeys:
        loaded && typeof loaded === "object" ? Object.keys(loaded) : [],
    });
    throw new Error(`Invalid visa sponsor provider manifest in ${path}`);
  }

  logger.info("Loaded visa sponsor provider manifest", {
    path,
    id: manifest.id,
    countryKey: manifest.countryKey,
  });

  return manifest;
}
