import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import {
  formatCountryLabel,
  isSourceAllowedForCountry,
  normalizeCountryKey,
} from "@shared/location-support.js";
import { normalizeStringArray } from "@shared/normalize-string-array.js";
import type { CreateJobInput, PipelineConfig } from "@shared/types";
import { getExtractorRegistry } from "../../extractors/registry";
import * as settingsRepo from "../../repositories/settings";
import { asyncPool } from "../../utils/async-pool";
import { type CrawlSource, progressHelpers, updateProgress } from "../progress";

const DISCOVERY_CONCURRENCY = 3;

type DiscoveryTaskResult = {
  discoveredJobs: CreateJobInput[];
  sourceErrors: string[];
};

type DiscoverySourceTask = {
  source: CrawlSource;
  termsTotal?: number;
  detail: string;
  run: () => Promise<DiscoveryTaskResult>;
};

function parseBlockedCompanyKeywords(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeStringArray(
      parsed.filter((value): value is string => typeof value === "string"),
    );
  } catch {
    return [];
  }
}

function isBlockedEmployer(
  employer: string | null | undefined,
  blockedKeywordsLowerCase: string[],
): boolean {
  if (!employer) return false;
  if (blockedKeywordsLowerCase.length === 0) return false;
  const normalizedEmployer = employer.toLowerCase();
  return blockedKeywordsLowerCase.some((keyword) =>
    normalizedEmployer.includes(keyword),
  );
}

export async function discoverJobsStep(args: {
  mergedConfig: PipelineConfig;
  shouldCancel?: () => boolean;
}): Promise<{
  discoveredJobs: CreateJobInput[];
  sourceErrors: string[];
}> {
  logger.info("Running discovery step");

  const discoveredJobs: CreateJobInput[] = [];
  const sourceErrors: string[] = [];

  const settings = await settingsRepo.getAllSettings();
  const registry = await getExtractorRegistry();

  const searchTermsSetting = settings.searchTerms;
  let searchTerms: string[] = [];

  if (searchTermsSetting) {
    searchTerms = JSON.parse(searchTermsSetting) as string[];
  } else {
    const defaultSearchTermsEnv =
      process.env.JOBSPY_SEARCH_TERMS || "web developer";
    searchTerms = defaultSearchTermsEnv
      .split("|")
      .map((term) => term.trim())
      .filter(Boolean);
  }

  const selectedCountry = normalizeCountryKey(
    settings.jobspyCountryIndeed ??
      settings.searchCities ??
      settings.jobspyLocation ??
      "united kingdom",
  );
  const compatibleSources = args.mergedConfig.sources.filter((source) =>
    isSourceAllowedForCountry(source, selectedCountry),
  );
  const skippedSources = args.mergedConfig.sources.filter(
    (source) => !compatibleSources.includes(source),
  );

  if (skippedSources.length > 0) {
    logger.info("Skipping incompatible sources for selected country", {
      step: "discover-jobs",
      country: selectedCountry,
      countryLabel: formatCountryLabel(selectedCountry),
      requestedSources: args.mergedConfig.sources,
      skippedSources,
    });
  }

  if (args.mergedConfig.sources.length > 0 && compatibleSources.length === 0) {
    throw new Error(
      `No compatible sources for selected country: ${formatCountryLabel(selectedCountry)}`,
    );
  }

  const groupedByManifest = new Map<
    string,
    { sources: string[]; detail: string; termsTotal?: number }
  >();

  for (const source of compatibleSources) {
    const manifest = registry.manifestBySource.get(source);
    if (!manifest) {
      sourceErrors.push(`${source}: extractor manifest not registered`);
      continue;
    }

    const existing = groupedByManifest.get(manifest.id);
    if (existing) {
      existing.sources.push(source);
      continue;
    }

    groupedByManifest.set(manifest.id, {
      sources: [source],
      termsTotal: searchTerms.length,
      detail: `${manifest.displayName}: fetching jobs...`,
    });
  }

  const sourceTasks: DiscoverySourceTask[] = [];

  for (const [manifestId, grouped] of groupedByManifest) {
    const manifest = registry.manifests.get(manifestId);
    if (!manifest) continue;

    sourceTasks.push({
      source: manifest.id,
      termsTotal: grouped.termsTotal,
      detail:
        grouped.sources.length > 1
          ? `${manifest.displayName}: ${grouped.sources.join(", ")}...`
          : grouped.detail,
      run: async () => {
        const result = await manifest.run({
          source: grouped.sources[0],
          selectedSources: grouped.sources,
          settings: { ...settings },
          searchTerms,
          selectedCountry,
          shouldCancel: args.shouldCancel,
          onProgress: (event) => {
            progressHelpers.crawlingUpdate({
              source: manifest.id,
              termsProcessed: event.termsProcessed,
              termsTotal: event.termsTotal,
              listPagesProcessed: event.listPagesProcessed,
              listPagesTotal: event.listPagesTotal,
              jobCardsFound: event.jobCardsFound,
              jobPagesEnqueued: event.jobPagesEnqueued,
              jobPagesSkipped: event.jobPagesSkipped,
              jobPagesProcessed: event.jobPagesProcessed,
              phase: event.phase,
              currentUrl: event.currentUrl,
            });

            if (event.detail) {
              updateProgress({
                step: "crawling",
                detail: event.detail,
              });
            }
          },
        });

        if (!result.success) {
          return {
            discoveredJobs: [],
            sourceErrors: [
              `${grouped.sources.join(",")}: ${result.error ?? "unknown error"}`,
            ],
          };
        }

        return {
          discoveredJobs: result.jobs,
          sourceErrors: [],
        };
      },
    });
  }

  const totalSources = sourceTasks.length;
  let completedSources = 0;

  progressHelpers.startCrawling(totalSources);

  if (args.shouldCancel?.()) {
    return { discoveredJobs, sourceErrors };
  }

  const sourceResults = await asyncPool({
    items: sourceTasks,
    concurrency: DISCOVERY_CONCURRENCY,
    shouldStop: args.shouldCancel,
    onTaskStarted: (sourceTask) => {
      progressHelpers.startSource(
        sourceTask.source,
        completedSources,
        totalSources,
        {
          termsTotal: sourceTask.termsTotal,
          detail: sourceTask.detail,
        },
      );
    },
    onTaskSettled: () => {
      completedSources += 1;
      progressHelpers.completeSource(completedSources, totalSources);
    },
    task: async (sourceTask) => {
      try {
        return await sourceTask.run();
      } catch (error) {
        logger.warn("Discovery source task failed", {
          sourceTask: sourceTask.source,
          error: sanitizeUnknown(error),
        });

        return {
          discoveredJobs: [],
          sourceErrors: [
            `${sourceTask.source}: ${error instanceof Error ? error.message : "unknown error"}`,
          ],
        };
      }
    },
  });

  for (const sourceResult of sourceResults) {
    discoveredJobs.push(...sourceResult.discoveredJobs);
    sourceErrors.push(...sourceResult.sourceErrors);
  }

  const blockedCompanyKeywords = parseBlockedCompanyKeywords(
    settings.blockedCompanyKeywords,
  );
  const blockedKeywordsLowerCase = blockedCompanyKeywords.map((value) =>
    value.toLowerCase(),
  );
  const filteredDiscoveredJobs = discoveredJobs.filter(
    (job) => !isBlockedEmployer(job.employer, blockedKeywordsLowerCase),
  );
  const droppedCount = discoveredJobs.length - filteredDiscoveredJobs.length;

  if (droppedCount > 0) {
    const blockedCompanyKeywordsPreview = blockedCompanyKeywords.slice(0, 10);
    const blockedCompanyKeywordsTruncated =
      blockedCompanyKeywordsPreview.length < blockedCompanyKeywords.length;

    logger.info("Dropped discovered jobs matching blocked company keywords", {
      step: "discover-jobs",
      droppedCount,
      blockedKeywordCount: blockedCompanyKeywords.length,
      blockedCompanyKeywordsPreview,
      blockedCompanyKeywordsTruncated,
    });

    logger.debug("Full blocked company keywords used for filtering", {
      step: "discover-jobs",
      blockedCompanyKeywords,
    });
  }

  if (args.shouldCancel?.()) {
    return { discoveredJobs: filteredDiscoveredJobs, sourceErrors };
  }

  if (filteredDiscoveredJobs.length === 0 && sourceErrors.length > 0) {
    throw new Error(`All sources failed: ${sourceErrors.join("; ")}`);
  }

  if (sourceErrors.length > 0) {
    logger.warn("Some discovery sources failed", { sourceErrors });
  }

  progressHelpers.crawlingComplete(filteredDiscoveredJobs.length);

  return { discoveredJobs: filteredDiscoveredJobs, sourceErrors };
}
