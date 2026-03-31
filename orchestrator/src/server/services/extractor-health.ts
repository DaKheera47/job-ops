import { logger } from "@infra/logger";
import { getExtractorRegistry } from "@server/extractors/registry";
import type { ExtractorSourceId } from "@shared/extractors";
import type {
  ExtractorHealthResponse,
  ExtractorManifest,
  ExtractorRunResult,
} from "@shared/types";

const HEALTH_CACHE_TTL_MS = 60 * 60 * 1000;
const DEFAULT_HEALTH_SEARCH_TERM = "software";
const DEFAULT_HEALTH_SELECTED_COUNTRY = "united kingdom";

type HealthProbeConfig = {
  searchTerm: string;
  selectedCountry: string;
  settings: Record<string, string | undefined>;
};

type ExtractorHealthCheckResult = {
  healthy: boolean;
  response: ExtractorHealthResponse;
  errorMessage?: string;
};

type CachedHealthCheckEntry = {
  checkedAtMs: number;
  expiresAtMs: number;
  result: ExtractorHealthCheckResult;
};

const HEALTH_PROBE_CONFIG_BY_SOURCE: Record<
  ExtractorSourceId,
  HealthProbeConfig
> = {
  gradcracker: {
    searchTerm: DEFAULT_HEALTH_SEARCH_TERM,
    selectedCountry: DEFAULT_HEALTH_SELECTED_COUNTRY,
    settings: {
      gradcrackerMaxJobsPerTerm: "1",
    },
  },
  indeed: {
    searchTerm: DEFAULT_HEALTH_SEARCH_TERM,
    selectedCountry: DEFAULT_HEALTH_SELECTED_COUNTRY,
    settings: {
      jobspyCountryIndeed: "UK",
      jobspyResultsWanted: "1",
    },
  },
  linkedin: {
    searchTerm: DEFAULT_HEALTH_SEARCH_TERM,
    selectedCountry: DEFAULT_HEALTH_SELECTED_COUNTRY,
    settings: {
      jobspyCountryIndeed: "UK",
      jobspyResultsWanted: "1",
    },
  },
  glassdoor: {
    searchTerm: DEFAULT_HEALTH_SEARCH_TERM,
    selectedCountry: DEFAULT_HEALTH_SELECTED_COUNTRY,
    settings: {
      jobspyCountryIndeed: "UK",
      jobspyResultsWanted: "1",
    },
  },
  ukvisajobs: {
    searchTerm: DEFAULT_HEALTH_SEARCH_TERM,
    selectedCountry: DEFAULT_HEALTH_SELECTED_COUNTRY,
    settings: {
      ukvisajobsMaxJobs: "1",
    },
  },
  adzuna: {
    searchTerm: DEFAULT_HEALTH_SEARCH_TERM,
    selectedCountry: DEFAULT_HEALTH_SELECTED_COUNTRY,
    settings: {
      adzunaMaxJobsPerTerm: "1",
    },
  },
  hiringcafe: {
    searchTerm: DEFAULT_HEALTH_SEARCH_TERM,
    selectedCountry: DEFAULT_HEALTH_SELECTED_COUNTRY,
    settings: {
      jobspyResultsWanted: "1",
    },
  },
  startupjobs: {
    searchTerm: DEFAULT_HEALTH_SEARCH_TERM,
    selectedCountry: DEFAULT_HEALTH_SELECTED_COUNTRY,
    settings: {
      startupjobsMaxJobsPerTerm: "1",
    },
  },
  workingnomads: {
    searchTerm: DEFAULT_HEALTH_SEARCH_TERM,
    selectedCountry: DEFAULT_HEALTH_SELECTED_COUNTRY,
    settings: {
      jobspyResultsWanted: "1",
    },
  },
  manual: {
    searchTerm: DEFAULT_HEALTH_SEARCH_TERM,
    selectedCountry: DEFAULT_HEALTH_SELECTED_COUNTRY,
    settings: {},
  },
};

const extractorHealthCache = new Map<
  ExtractorSourceId,
  CachedHealthCheckEntry
>();

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function cloneCachedResult(
  entry: CachedHealthCheckEntry,
  now: number,
): ExtractorHealthCheckResult {
  return {
    ...entry.result,
    response: {
      ...entry.result.response,
      cached: true,
      cacheAgeMs: Math.max(now - entry.checkedAtMs, 0),
    },
  };
}

function getCachedHealthCheck(
  source: ExtractorSourceId,
  now: number,
): ExtractorHealthCheckResult | null {
  const cached = extractorHealthCache.get(source);
  if (!cached) return null;
  if (cached.expiresAtMs <= now) {
    extractorHealthCache.delete(source);
    return null;
  }
  return cloneCachedResult(cached, now);
}

function cacheHealthCheck(
  source: ExtractorSourceId,
  checkedAtMs: number,
  result: ExtractorHealthCheckResult,
): void {
  extractorHealthCache.set(source, {
    checkedAtMs,
    expiresAtMs: checkedAtMs + HEALTH_CACHE_TTL_MS,
    result,
  });
}

function getMissingRequiredEnvVars(manifest: ExtractorManifest): string[] {
  return (manifest.requiredEnvVars ?? []).filter((name) => {
    const value = process.env[name];
    return !value || value.trim().length === 0;
  });
}

function buildResponse(args: {
  source: ExtractorSourceId;
  manifestId: string;
  status: "healthy" | "unhealthy";
  checkedAtMs: number;
  durationMs: number;
  jobsValidated: number;
  jobsReturned: number;
  searchTerm: string;
  message: string;
}): ExtractorHealthResponse {
  return {
    source: args.source,
    manifestId: args.manifestId,
    status: args.status,
    checkedAt: new Date(args.checkedAtMs).toISOString(),
    durationMs: args.durationMs,
    cacheAgeMs: 0,
    jobsValidated: args.jobsValidated,
    jobsReturned: args.jobsReturned,
    searchTerm: args.searchTerm,
    cached: false,
    message: args.message,
  };
}

function createHealthyResult(args: {
  source: ExtractorSourceId;
  manifestId: string;
  checkedAtMs: number;
  durationMs: number;
  jobsValidated: number;
  jobsReturned: number;
  searchTerm: string;
}): ExtractorHealthCheckResult {
  return {
    healthy: true,
    response: buildResponse({
      source: args.source,
      manifestId: args.manifestId,
      status: "healthy",
      checkedAtMs: args.checkedAtMs,
      durationMs: args.durationMs,
      jobsValidated: args.jobsValidated,
      jobsReturned: args.jobsReturned,
      searchTerm: args.searchTerm,
      message: `Extractor returned ${args.jobsValidated} valid job${args.jobsValidated === 1 ? "" : "s"}.`,
    }),
  };
}

function createUnhealthyResult(args: {
  source: ExtractorSourceId;
  manifestId: string;
  checkedAtMs: number;
  durationMs: number;
  jobsValidated?: number;
  jobsReturned?: number;
  searchTerm: string;
  message: string;
}): ExtractorHealthCheckResult {
  return {
    healthy: false,
    errorMessage: args.message,
    response: buildResponse({
      source: args.source,
      manifestId: args.manifestId,
      status: "unhealthy",
      checkedAtMs: args.checkedAtMs,
      durationMs: args.durationMs,
      jobsValidated: args.jobsValidated ?? 0,
      jobsReturned: args.jobsReturned ?? 0,
      searchTerm: args.searchTerm,
      message: args.message,
    }),
  };
}

function countValidJobs(
  source: ExtractorSourceId,
  result: ExtractorRunResult,
): number {
  return result.jobs.filter(
    (job) =>
      job.source === source &&
      hasNonEmptyString(job.title) &&
      hasNonEmptyString(job.employer) &&
      hasNonEmptyString(job.jobUrl),
  ).length;
}

async function runFreshHealthCheck(args: {
  source: ExtractorSourceId;
  manifest: ExtractorManifest;
  checkedAtMs: number;
}): Promise<ExtractorHealthCheckResult> {
  const { source, manifest, checkedAtMs } = args;
  const probeConfig = HEALTH_PROBE_CONFIG_BY_SOURCE[source];
  const startMs = Date.now();

  const missingEnvVars = getMissingRequiredEnvVars(manifest);
  if (missingEnvVars.length > 0) {
    return createUnhealthyResult({
      source,
      manifestId: manifest.id,
      checkedAtMs,
      durationMs: Date.now() - startMs,
      searchTerm: probeConfig.searchTerm,
      message: `Missing required environment variables: ${missingEnvVars.join(", ")}`,
    });
  }

  try {
    const result = await manifest.run({
      source,
      selectedSources: [source],
      settings: probeConfig.settings,
      searchTerms: [probeConfig.searchTerm],
      selectedCountry: probeConfig.selectedCountry,
    });

    if (!result.success) {
      return createUnhealthyResult({
        source,
        manifestId: manifest.id,
        checkedAtMs,
        durationMs: Date.now() - startMs,
        jobsReturned: result.jobs.length,
        searchTerm: probeConfig.searchTerm,
        message: result.error ?? "Extractor returned an unsuccessful result.",
      });
    }

    if (result.jobs.length === 0) {
      return createUnhealthyResult({
        source,
        manifestId: manifest.id,
        checkedAtMs,
        durationMs: Date.now() - startMs,
        searchTerm: probeConfig.searchTerm,
        message: "Extractor returned no jobs.",
      });
    }

    const jobsValidated = countValidJobs(source, result);
    if (jobsValidated === 0) {
      return createUnhealthyResult({
        source,
        manifestId: manifest.id,
        checkedAtMs,
        durationMs: Date.now() - startMs,
        jobsReturned: result.jobs.length,
        searchTerm: probeConfig.searchTerm,
        message:
          "Extractor returned jobs, but none passed validation for source, title, employer, and job URL.",
      });
    }

    return createHealthyResult({
      source,
      manifestId: manifest.id,
      checkedAtMs,
      durationMs: Date.now() - startMs,
      jobsValidated,
      jobsReturned: result.jobs.length,
      searchTerm: probeConfig.searchTerm,
    });
  } catch (error) {
    return createUnhealthyResult({
      source,
      manifestId: manifest.id,
      checkedAtMs,
      durationMs: Date.now() - startMs,
      searchTerm: probeConfig.searchTerm,
      message:
        error instanceof Error
          ? error.message
          : "Unexpected error while running extractor health check.",
    });
  }
}

export async function checkExtractorHealth(
  source: ExtractorSourceId,
): Promise<ExtractorHealthCheckResult | null> {
  const now = Date.now();
  const cached = getCachedHealthCheck(source, now);
  if (cached) {
    logger.info("Extractor health cache hit", {
      source,
      manifestId: cached.response.manifestId,
      status: cached.response.status,
      cacheAgeMs: cached.response.cacheAgeMs,
    });
    return cached;
  }

  const registry = await getExtractorRegistry();
  const manifest = registry.manifestBySource.get(source);
  if (!manifest) return null;

  const fresh = await runFreshHealthCheck({
    source,
    manifest,
    checkedAtMs: now,
  });

  cacheHealthCheck(source, now, fresh);

  const logMeta = {
    source,
    manifestId: manifest.id,
    status: fresh.response.status,
    durationMs: fresh.response.durationMs,
    jobsReturned: fresh.response.jobsReturned,
    jobsValidated: fresh.response.jobsValidated,
  };

  if (fresh.healthy) {
    logger.info("Extractor health check completed", logMeta);
  } else {
    logger.warn("Extractor health check failed", {
      ...logMeta,
      error: fresh.errorMessage,
    });
  }

  return fresh;
}

export function __resetExtractorHealthCacheForTests(): void {
  extractorHealthCache.clear();
}

export function __getExtractorHealthCacheTtlMsForTests(): number {
  return HEALTH_CACHE_TTL_MS;
}

export function __getExtractorHealthProbeConfigForTests(
  source: ExtractorSourceId,
): HealthProbeConfig {
  return {
    ...HEALTH_PROBE_CONFIG_BY_SOURCE[source],
    settings: { ...HEALTH_PROBE_CONFIG_BY_SOURCE[source].settings },
  };
}
