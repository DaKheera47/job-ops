import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import {
  EXTRACTOR_SOURCE_IDS,
  EXTRACTOR_SOURCE_METADATA,
  type ExtractorSourceId,
  PIPELINE_EXTRACTOR_SOURCE_IDS,
} from "@shared/extractors";
import type { ExtractorManifest } from "@shared/types";
import { discoverManifestPaths, loadManifestFromFile } from "./discovery";

export interface ExtractorRegistry {
  manifests: Map<string, ExtractorManifest>;
  manifestBySource: Map<ExtractorSourceId, ExtractorManifest>;
  availableSources: ExtractorSourceId[];
}

let registry: ExtractorRegistry | null = null;
let initPromise: Promise<ExtractorRegistry> | null = null;

class DuplicateManifestIdError extends Error {
  readonly manifestId: string;

  constructor(manifestId: string) {
    super(`Duplicate extractor manifest id: ${manifestId}`);
    this.manifestId = manifestId;
    this.name = "DuplicateManifestIdError";
  }
}

class DuplicateSourceProviderError extends Error {
  readonly source: ExtractorSourceId;
  readonly existingManifestId: string;
  readonly duplicateManifestId: string;

  constructor(args: {
    source: ExtractorSourceId;
    existingManifestId: string;
    duplicateManifestId: string;
  }) {
    super(
      `Source ${args.source} is provided by multiple manifests (${args.existingManifestId}, ${args.duplicateManifestId})`,
    );
    this.source = args.source;
    this.existingManifestId = args.existingManifestId;
    this.duplicateManifestId = args.duplicateManifestId;
    this.name = "DuplicateSourceProviderError";
  }
}

export function __resetExtractorRegistryForTests(): void {
  registry = null;
  initPromise = null;
}

function strictModeEnabled(): boolean {
  if (process.env.EXTRACTOR_REGISTRY_STRICT) {
    const raw = process.env.EXTRACTOR_REGISTRY_STRICT.toLowerCase();
    return raw === "1" || raw === "true";
  }

  return process.env.NODE_ENV === "production";
}

function resolveCatalogMismatches(
  manifests: Map<string, ExtractorManifest>,
): void {
  const missingFromCatalog = new Set<string>();
  const missingManifest = new Set<ExtractorSourceId>();

  for (const manifest of manifests.values()) {
    for (const source of manifest.providesSources) {
      if (!EXTRACTOR_SOURCE_IDS.includes(source as ExtractorSourceId)) {
        missingFromCatalog.add(source);
      }
    }
  }

  for (const sourceId of PIPELINE_EXTRACTOR_SOURCE_IDS) {
    const hasManifest = Array.from(manifests.values()).some((manifest) =>
      manifest.providesSources.includes(sourceId),
    );
    if (!hasManifest) {
      missingManifest.add(sourceId);
    }
  }

  const strict = strictModeEnabled();
  if (missingFromCatalog.size > 0) {
    const message =
      "Extractor sources are missing from shared extractor catalog";
    const context = {
      missingFromCatalog: [...missingFromCatalog],
      strict,
    };
    if (strict) {
      throw new Error(`${message}: ${[...missingFromCatalog].join(", ")}`);
    }
    logger.warn(message, context);
  }

  if (missingManifest.size > 0) {
    logger.warn("Shared extractor sources have no runtime manifest", {
      missingManifest: [...missingManifest],
      strict,
    });
  }
}

async function createRegistry(): Promise<ExtractorRegistry> {
  const manifestPaths = await discoverManifestPaths();
  const manifests = new Map<string, ExtractorManifest>();
  const manifestBySource = new Map<ExtractorSourceId, ExtractorManifest>();

  for (const path of manifestPaths) {
    try {
      const manifest = await loadManifestFromFile(path);
      if (manifests.has(manifest.id)) {
        throw new DuplicateManifestIdError(manifest.id);
      }

      const invalidSources = manifest.providesSources.filter(
        (source) => !EXTRACTOR_SOURCE_IDS.includes(source as ExtractorSourceId),
      );
      const validSources = manifest.providesSources.filter((source) =>
        EXTRACTOR_SOURCE_IDS.includes(source as ExtractorSourceId),
      ) as ExtractorSourceId[];

      if (invalidSources.length > 0) {
        logger.warn("Extractor manifest contains unknown sources", {
          manifestId: manifest.id,
          path,
          invalidSources,
        });
      }

      if (validSources.length === 0) {
        logger.warn("Skipping extractor manifest with no known sources", {
          manifestId: manifest.id,
          path,
          declaredSources: manifest.providesSources,
        });
        continue;
      }

      for (const typedSource of validSources) {
        if (manifestBySource.has(typedSource)) {
          const existing = manifestBySource.get(typedSource);
          throw new DuplicateSourceProviderError({
            source: typedSource,
            existingManifestId: existing?.id ?? "unknown",
            duplicateManifestId: manifest.id,
          });
        }
      }

      manifests.set(manifest.id, manifest);
      for (const source of validSources) {
        manifestBySource.set(source, manifest);
      }
    } catch (error) {
      if (error instanceof DuplicateSourceProviderError) {
        throw error;
      }

      if (error instanceof DuplicateManifestIdError && strictModeEnabled()) {
        throw error;
      }

      logger.warn("Skipping invalid extractor manifest", {
        path,
        error: sanitizeUnknown(error),
      });
    }
  }

  resolveCatalogMismatches(manifests);

  const availableSources = PIPELINE_EXTRACTOR_SOURCE_IDS.filter((source) =>
    manifestBySource.has(source),
  );

  logger.info("Extractor registry initialized", {
    manifestCount: manifests.size,
    sourceCount: availableSources.length,
    manifests: Array.from(manifests.values()).map((manifest) => ({
      id: manifest.id,
      sources: manifest.providesSources,
      requiredEnvVarsCount: manifest.requiredEnvVars?.length ?? 0,
    })),
  });

  return {
    manifests,
    manifestBySource,
    availableSources,
  };
}

export async function initializeExtractorRegistry(): Promise<ExtractorRegistry> {
  if (registry) return registry;
  if (!initPromise) {
    initPromise = createRegistry()
      .then((created) => {
        registry = created;
        return created;
      })
      .catch((error) => {
        logger.error("Failed to initialize extractor registry", {
          error: sanitizeUnknown(error),
        });
        registry = null;
        initPromise = null;
        throw error;
      });
  }
  return initPromise;
}

export async function getExtractorRegistry(): Promise<ExtractorRegistry> {
  return initializeExtractorRegistry();
}

export async function listAvailableSources(): Promise<
  Array<{ id: ExtractorSourceId; label: string }>
> {
  const current = await getExtractorRegistry();
  return current.availableSources.map((source) => ({
    id: source,
    label: EXTRACTOR_SOURCE_METADATA[source].label,
  }));
}

export async function isSourceAvailable(
  source: ExtractorSourceId,
): Promise<boolean> {
  const current = await getExtractorRegistry();
  return current.manifestBySource.has(source);
}
