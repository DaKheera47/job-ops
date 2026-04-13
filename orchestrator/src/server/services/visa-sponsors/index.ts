/**
 * Visa Sponsors Service
 *
 * Multi-provider facade that manages downloading, storing, and searching
 * visa sponsor lists across different countries.
 *
 * Country-specific logic lives in visa-sponsor-providers/{country}/manifest.ts.
 * This service handles storage, caching, scheduling, and search — all shared concerns.
 */

import fs from "node:fs";
import path from "node:path";
import { getDataDir } from "@server/config/dataDir";
import { createScheduler } from "@server/utils/scheduler";
import {
  calculateSimilarity,
  normalizeCompanyName,
} from "@shared/job-matching";
import type {
  VisaSponsor,
  VisaSponsorProviderManifest,
  VisaSponsorProviderStatus,
  VisaSponsorSearchResult,
  VisaSponsorStatusResponse,
} from "@shared/types";
import { isVisaSponsorProviderId } from "@shared/visa-sponsor-providers";
import { parseVisaSponsorsCsv } from "@shared/visa-sponsors/csv";
import {
  getVisaSponsorProviderRegistry,
  initializeVisaSponsorProviderRegistry,
} from "./providers/registry";

export type { VisaSponsor, VisaSponsorSearchResult };
export type VisaSponsorStatus = VisaSponsorStatusResponse;

// ============================================================================
// Per-provider in-memory state
// ============================================================================

interface ProviderState {
  cache: VisaSponsor[] | null;
  cacheLoadedAt: Date | null;
  isUpdating: boolean;
  updateError: string | null;
  scheduler: ReturnType<typeof createScheduler> | null;
}

const providerState = new Map<string, ProviderState>();

function getOrCreateProviderState(providerId: string): ProviderState {
  let state = providerState.get(providerId);
  if (!state) {
    state = {
      cache: null,
      cacheLoadedAt: null,
      isUpdating: false,
      updateError: null,
      scheduler: null,
    };
    providerState.set(providerId, state);
  }
  return state;
}

// ============================================================================
// Company name normalization and similarity (shared across all providers)
// ============================================================================

// ============================================================================
// CSV parsing (generic 5-column format used for stored files)
// ============================================================================

export const parseCsv = parseVisaSponsorsCsv;

// ============================================================================
// Per-provider storage helpers
// ============================================================================

function getProviderDataDir(providerId: string): string {
  return path.join(getDataDir(), "visa-sponsors", providerId);
}

function ensureProviderDir(providerId: string): void {
  const dir = getProviderDataDir(providerId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getMetadataPath(providerId: string): string {
  return path.join(getProviderDataDir(providerId), "metadata.json");
}

function readMetadata(providerId: string): {
  lastUpdated: string | null;
  csvFile: string | null;
} {
  const metaPath = getMetadataPath(providerId);
  if (!fs.existsSync(metaPath)) {
    return { lastUpdated: null, csvFile: null };
  }
  try {
    return JSON.parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    return { lastUpdated: null, csvFile: null };
  }
}

function writeMetadata(
  providerId: string,
  data: { lastUpdated: string; csvFile: string },
): void {
  fs.writeFileSync(getMetadataPath(providerId), JSON.stringify(data, null, 2));
}

function getCsvFiles(providerId: string): string[] {
  const dir = getProviderDataDir(providerId);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".csv"))
    .sort()
    .reverse();
}

function cleanupOldCsvFiles(providerId: string): void {
  const dir = getProviderDataDir(providerId);
  const files = getCsvFiles(providerId);
  if (files.length > 2) {
    for (const file of files.slice(2)) {
      const filePath = path.join(dir, file);
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Removed old CSV for ${providerId}: ${file}`);
      } catch (err) {
        console.warn(
          `⚠️ Failed to remove old CSV for ${providerId}: ${file}`,
          err,
        );
      }
    }
  }
}

// ============================================================================
// Core per-provider operations
// ============================================================================

export type VisaSponsorDownloadErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "NO_PROVIDERS_REGISTERED"
  | "UPDATE_IN_PROGRESS"
  | "ALL_PROVIDER_UPDATES_FAILED";

export type VisaSponsorDownloadResult =
  | { success: true; message: string }
  | {
      success: false;
      message: string;
      code: VisaSponsorDownloadErrorCode;
    };

async function downloadLatestDataForProvider(
  manifest: VisaSponsorProviderManifest,
): Promise<VisaSponsorDownloadResult> {
  const { id } = manifest;
  const state = getOrCreateProviderState(id);

  if (state.isUpdating) {
    return {
      success: false,
      message: `Update already in progress for ${id}`,
      code: "UPDATE_IN_PROGRESS",
    };
  }

  state.isUpdating = true;
  state.updateError = null;
  ensureProviderDir(id);

  try {
    console.log(`📥 Fetching sponsor data for provider: ${id}`);
    const sponsors = await manifest.fetchSponsors();

    if (sponsors.length === 0) {
      throw new Error(`Provider ${id} returned an empty sponsor list`);
    }

    // Serialise to canonical CSV for storage
    const csvContent = [
      "Organisation Name,Town/City,County,Type & Rating,Route",
      ...sponsors.map((s) =>
        [s.organisationName, s.townCity, s.county, s.typeRating, s.route]
          .map((f) => `"${f.replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");

    const dateStr = new Date().toISOString().split("T")[0];
    const filename = `visa_sponsors_${dateStr}.csv`;
    const dir = getProviderDataDir(id);
    fs.writeFileSync(path.join(dir, filename), csvContent);

    writeMetadata(id, {
      lastUpdated: new Date().toISOString(),
      csvFile: filename,
    });
    cleanupOldCsvFiles(id);

    // Bust cache
    state.cache = null;
    state.cacheLoadedAt = null;

    console.log(
      `✅ Downloaded ${sponsors.length} sponsors for provider: ${id}`,
    );
    return {
      success: true,
      message: `Successfully downloaded ${sponsors.length} sponsors`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    state.updateError = message;
    console.error(
      `❌ Failed to download sponsors for provider ${id}:`,
      message,
    );
    return {
      success: false,
      message,
      code: "ALL_PROVIDER_UPDATES_FAILED",
    };
  } finally {
    state.isUpdating = false;
  }
}

function loadSponsorsForProvider(providerId: string): VisaSponsor[] {
  const state = getOrCreateProviderState(providerId);

  // Return valid cache (< 1 hour old)
  if (state.cache && state.cacheLoadedAt) {
    if (Date.now() - state.cacheLoadedAt.getTime() < 60 * 60 * 1000) {
      return state.cache;
    }
  }

  const metadata = readMetadata(providerId);
  if (!metadata.csvFile) return [];

  const csvPath = path.join(getProviderDataDir(providerId), metadata.csvFile);
  if (!fs.existsSync(csvPath)) return [];

  try {
    const content = fs.readFileSync(csvPath, "utf-8");
    const sponsors = parseCsv(content);
    state.cache = sponsors;
    state.cacheLoadedAt = new Date();
    return sponsors;
  } catch (error) {
    console.error(`Failed to load sponsors for provider ${providerId}:`, error);
    return [];
  }
}

async function getRegisteredProviderManifest(
  providerId: string,
): Promise<VisaSponsorProviderManifest | null> {
  if (!isVisaSponsorProviderId(providerId)) {
    return null;
  }

  const reg = await getVisaSponsorProviderRegistry();
  return reg.manifests.get(providerId) ?? null;
}

// ============================================================================
// Public API
// These entry points are async and preserve the legacy responsibilities
// (download, search, status, load) while operating across multiple providers.
// ============================================================================

/**
 * Download the latest sponsor data.
 * If providerId is omitted, updates all registered providers.
 */
export async function downloadLatestCsv(
  providerId?: string,
): Promise<VisaSponsorDownloadResult> {
  const reg = await getVisaSponsorProviderRegistry();
  const validatedProvider = providerId
    ? await getRegisteredProviderManifest(providerId)
    : null;

  const manifests = providerId
    ? ([validatedProvider].filter(Boolean) as VisaSponsorProviderManifest[])
    : [...reg.manifests.values()];

  if (manifests.length === 0) {
    return {
      success: false,
      message: providerId
        ? `Provider '${providerId}' not found`
        : "No providers registered",
      code: providerId ? "PROVIDER_NOT_FOUND" : "NO_PROVIDERS_REGISTERED",
    };
  }

  const results = await Promise.allSettled(
    manifests.map((m) => downloadLatestDataForProvider(m)),
  );

  const failures = results.filter(
    (r) =>
      r.status === "rejected" || (r.status === "fulfilled" && !r.value.success),
  );

  if (failures.length === manifests.length) {
    const firstFailure = failures[0];
    if (firstFailure?.status === "fulfilled") {
      return firstFailure.value;
    }
    return {
      success: false,
      message: "All provider updates failed",
      code: "ALL_PROVIDER_UPDATES_FAILED",
    };
  }

  const succeeded = manifests.length - failures.length;
  return {
    success: true,
    message: `Updated ${succeeded}/${manifests.length} providers`,
  };
}

/**
 * Load sponsors across all registered providers, optionally filtered by countryKey.
 */
async function loadAllSponsors(countryKey?: string): Promise<
  {
    providerId: VisaSponsorProviderManifest["id"];
    countryKey: string;
    sponsors: VisaSponsor[];
  }[]
> {
  const reg = await getVisaSponsorProviderRegistry();
  const manifests = countryKey
    ? ([reg.manifestByCountryKey.get(countryKey)].filter(
        Boolean,
      ) as VisaSponsorProviderManifest[])
    : [...reg.manifests.values()];

  return manifests.map((m) => ({
    providerId: m.id,
    countryKey: m.countryKey,
    sponsors: loadSponsorsForProvider(m.id),
  }));
}

/**
 * Search for sponsors by company name.
 * Pass countryKey to restrict to a specific provider; omit to search all.
 */
export async function searchSponsors(
  query: string,
  options: { limit?: number; minScore?: number; countryKey?: string } = {},
): Promise<VisaSponsorSearchResult[]> {
  const { limit = 50, minScore = 30, countryKey } = options;

  if (!query.trim()) return [];

  const providerData = await loadAllSponsors(countryKey);
  const normalizedQuery = normalizeCompanyName(query);
  const results: VisaSponsorSearchResult[] = [];
  const seen = new Set<string>();

  for (const {
    providerId,
    countryKey: providerCountryKey,
    sponsors,
  } of providerData) {
    for (const sponsor of sponsors) {
      const dedupeKey = `${providerId}::${sponsor.organisationName}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const normalizedSponsor = normalizeCompanyName(sponsor.organisationName);
      const score = calculateSimilarity(normalizedQuery, normalizedSponsor);

      if (score >= minScore) {
        results.push({
          providerId,
          countryKey: providerCountryKey,
          sponsor,
          score,
          matchedName: normalizedSponsor,
        });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function calculateSponsorMatchSummary(
  results: VisaSponsorSearchResult[],
): { sponsorMatchScore: number; sponsorMatchNames: string | null } {
  if (results.length === 0) {
    return { sponsorMatchScore: 0, sponsorMatchNames: null };
  }

  const topScore = results[0].score;
  const perfectMatches = results.filter((r) => r.score === 100);
  const matchesToReport =
    perfectMatches.length >= 2 ? perfectMatches.slice(0, 2) : [results[0]];

  return {
    sponsorMatchScore: topScore,
    sponsorMatchNames: JSON.stringify(
      matchesToReport.map((r) => r.sponsor.organisationName),
    ),
  };
}

export async function getStatus(): Promise<VisaSponsorStatusResponse> {
  const reg = await getVisaSponsorProviderRegistry();

  const providers: VisaSponsorProviderStatus[] = [
    ...reg.manifests.values(),
  ].map((manifest) => {
    const state = getOrCreateProviderState(manifest.id);
    const metadata = readMetadata(manifest.id);
    const dir = getProviderDataDir(manifest.id);
    const sponsors = loadSponsorsForProvider(manifest.id);

    return {
      providerId: manifest.id,
      countryKey: manifest.countryKey,
      lastUpdated: metadata.lastUpdated,
      csvPath: metadata.csvFile ? path.join(dir, metadata.csvFile) : null,
      totalSponsors: sponsors.length,
      isUpdating: state.isUpdating,
      nextScheduledUpdate: state.scheduler?.getNextRun() ?? null,
      error: state.updateError,
    };
  });

  return { providers };
}

export async function getOrganizationDetails(
  organisationName: string,
  providerId?: string,
): Promise<VisaSponsor[]> {
  const validatedProvider = providerId
    ? await getRegisteredProviderManifest(providerId)
    : null;
  const providerData = providerId
    ? [
        {
          providerId: validatedProvider?.id ?? providerId,
          countryKey: validatedProvider?.countryKey ?? "",
          sponsors: validatedProvider
            ? loadSponsorsForProvider(validatedProvider.id)
            : [],
        },
      ]
    : await loadAllSponsors();
  return providerData
    .flatMap(({ sponsors }) => sponsors)
    .filter((s) => s.organisationName === organisationName);
}

/**
 * Load sponsors from the latest CSV file (kept for backwards compatibility).
 * Returns all sponsors across all providers.
 */
export async function loadSponsors(): Promise<VisaSponsor[]> {
  const providerData = await loadAllSponsors();
  return providerData.flatMap(({ sponsors }) => sponsors);
}

// ============================================================================
// Initialization
// ============================================================================

export async function initialize(): Promise<void> {
  const reg = await initializeVisaSponsorProviderRegistry();

  for (const manifest of reg.manifests.values()) {
    ensureProviderDir(manifest.id);
    const metadata = readMetadata(manifest.id);

    if (!metadata.csvFile) {
      console.log(
        `📥 No data found for provider ${manifest.id}, downloading...`,
      );
      await downloadLatestDataForProvider(manifest);
    } else {
      const sponsors = loadSponsorsForProvider(manifest.id);
      console.log(
        `✅ Provider ${manifest.id} initialized with ${sponsors.length} sponsors`,
      );
    }

    // Start per-provider scheduler
    const state = getOrCreateProviderState(manifest.id);
    const schedulerName = `visa-sponsors-${manifest.id}`;
    state.scheduler = createScheduler(schedulerName, async () => {
      await downloadLatestDataForProvider(manifest);
    });
    state.scheduler.start(manifest.scheduledUpdateHour ?? 2);
  }
}
