import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import type { VisaSponsorProviderManifest } from "@shared/types";
import {
  isVisaSponsorProviderId,
  VISA_SPONSOR_PROVIDER_IDS,
  type VisaSponsorProviderId,
} from "@shared/visa-sponsor-providers";
import {
  discoverProviderManifestPaths,
  loadProviderManifestFromFile,
} from "./discovery";

export interface VisaSponsorProviderRegistry {
  manifests: Map<VisaSponsorProviderId, VisaSponsorProviderManifest>;
  manifestByCountryKey: Map<string, VisaSponsorProviderManifest>;
  availableProviderIds: VisaSponsorProviderId[];
}

let registry: VisaSponsorProviderRegistry | null = null;
let initPromise: Promise<VisaSponsorProviderRegistry> | null = null;

export function __resetVisaSponsorRegistryForTests(): void {
  registry = null;
  initPromise = null;
}

async function createRegistry(): Promise<VisaSponsorProviderRegistry> {
  const manifestPaths = await discoverProviderManifestPaths();
  const manifests = new Map<
    VisaSponsorProviderId,
    VisaSponsorProviderManifest
  >();
  const manifestByCountryKey = new Map<string, VisaSponsorProviderManifest>();

  for (const path of manifestPaths) {
    try {
      const manifest = await loadProviderManifestFromFile(path);

      if (manifests.has(manifest.id)) {
        logger.warn("Duplicate visa sponsor provider id — skipping", {
          id: manifest.id,
          path,
        });
        continue;
      }

      if (!isVisaSponsorProviderId(manifest.id)) {
        logger.warn("Visa sponsor provider id not in catalog — skipping", {
          id: manifest.id,
          path,
          knownIds: VISA_SPONSOR_PROVIDER_IDS,
        });
        continue;
      }

      if (manifestByCountryKey.has(manifest.countryKey)) {
        logger.warn(
          "Duplicate countryKey in visa sponsor providers — skipping",
          {
            countryKey: manifest.countryKey,
            path,
          },
        );
        continue;
      }

      manifests.set(manifest.id, manifest);
      manifestByCountryKey.set(manifest.countryKey, manifest);
    } catch (error) {
      logger.warn("Skipping invalid visa sponsor provider manifest", {
        path,
        error: sanitizeUnknown(error),
      });
    }
  }

  const availableProviderIds = [...manifests.keys()];
  logger.info("Visa sponsor provider registry initialized", {
    count: availableProviderIds.length,
    providers: availableProviderIds,
  });

  return { manifests, manifestByCountryKey, availableProviderIds };
}

export async function initializeVisaSponsorProviderRegistry(): Promise<VisaSponsorProviderRegistry> {
  if (registry) return registry;
  if (!initPromise) {
    initPromise = createRegistry()
      .then((created) => {
        registry = created;
        return created;
      })
      .catch((error) => {
        logger.error("Failed to initialize visa sponsor provider registry", {
          error: sanitizeUnknown(error),
        });
        registry = null;
        initPromise = null;
        throw error;
      });
  }
  return initPromise;
}

export async function getVisaSponsorProviderRegistry(): Promise<VisaSponsorProviderRegistry> {
  return initializeVisaSponsorProviderRegistry();
}
