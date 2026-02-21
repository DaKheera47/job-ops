import { logger } from "@infra/logger";
import {
  formatCountryLabel,
  getAdzunaCountryCode,
  isSourceAllowedForCountry,
  normalizeCountryKey,
} from "@shared/location-support.js";
import { parseSearchCitiesSetting } from "@shared/search-cities.js";
import type { CreateJobInput, PipelineConfig } from "@shared/types";
import * as jobsRepo from "../../repositories/jobs";
import * as settingsRepo from "../../repositories/settings";
import { runAdzuna } from "../../services/adzuna";
import { runCrawler } from "../../services/crawler";
import { runHiringCafe } from "../../services/hiring-cafe";
import { runJobSpy } from "../../services/jobspy";
import { runUkVisaJobs } from "../../services/ukvisajobs";
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

  const jobSpySites = compatibleSources.filter(
    (source): source is "indeed" | "linkedin" | "glassdoor" =>
      source === "indeed" || source === "linkedin" || source === "glassdoor",
  );

  const sourceTasks: DiscoverySourceTask[] = [];

  if (jobSpySites.length > 0) {
    sourceTasks.push({
      source: "jobspy",
      termsTotal: searchTerms.length,
      detail: `JobSpy: scraping ${jobSpySites.join(", ")}...`,
      run: async () => {
        const jobSpyResult = await runJobSpy({
          sites: jobSpySites,
          searchTerms,
          location:
            settings.searchCities ?? settings.jobspyLocation ?? undefined,
          resultsWanted: settings.jobspyResultsWanted
            ? parseInt(settings.jobspyResultsWanted, 10)
            : undefined,
          countryIndeed: settings.jobspyCountryIndeed ?? undefined,
          onProgress: (event) => {
            if (event.type === "term_start") {
              progressHelpers.crawlingUpdate({
                source: "jobspy",
                termsProcessed: Math.max(event.termIndex - 1, 0),
                termsTotal: event.termTotal,
                phase: "list",
                currentUrl: event.searchTerm,
              });
              updateProgress({
                step: "crawling",
                detail: `JobSpy: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
              });
              return;
            }

            progressHelpers.crawlingUpdate({
              source: "jobspy",
              termsProcessed: event.termIndex,
              termsTotal: event.termTotal,
              phase: "list",
              currentUrl: event.searchTerm,
            });
            updateProgress({
              step: "crawling",
              detail: `JobSpy: completed ${event.termIndex}/${event.termTotal} (${event.searchTerm}) with ${event.jobsFoundTerm} jobs`,
            });
          },
        });

        if (!jobSpyResult.success) {
          return {
            discoveredJobs: [],
            sourceErrors: [`jobspy: ${jobSpyResult.error ?? "unknown error"}`],
          };
        }

        return {
          discoveredJobs: jobSpyResult.jobs,
          sourceErrors: [],
        };
      },
    });
  }

  if (compatibleSources.includes("adzuna")) {
    sourceTasks.push({
      source: "adzuna",
      termsTotal: searchTerms.length,
      detail: "Adzuna: fetching jobs...",
      run: async () => {
        const adzunaCountryCode = getAdzunaCountryCode(selectedCountry);
        if (!adzunaCountryCode) {
          return {
            discoveredJobs: [],
            sourceErrors: [
              `adzuna: unsupported country ${formatCountryLabel(selectedCountry)}`,
            ],
          };
        }

        const adzunaMaxJobsPerTerm = settings.adzunaMaxJobsPerTerm
          ? parseInt(settings.adzunaMaxJobsPerTerm, 10)
          : 50;

        const adzunaResult = await runAdzuna({
          country: adzunaCountryCode,
          countryKey: selectedCountry,
          locations: parseSearchCitiesSetting(
            settings.searchCities ?? settings.jobspyLocation,
          ),
          searchTerms,
          maxJobsPerTerm: adzunaMaxJobsPerTerm,
          onProgress: (event) => {
            if (event.type === "term_start") {
              progressHelpers.crawlingUpdate({
                source: "adzuna",
                termsProcessed: Math.max(event.termIndex - 1, 0),
                termsTotal: event.termTotal,
                phase: "list",
                currentUrl: event.searchTerm,
              });
              updateProgress({
                step: "crawling",
                detail: `Adzuna: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
              });
              return;
            }

            if (event.type === "page_fetched") {
              progressHelpers.crawlingUpdate({
                source: "adzuna",
                termsProcessed: Math.max(event.termIndex - 1, 0),
                termsTotal: event.termTotal,
                listPagesProcessed: event.pageNo,
                jobPagesEnqueued: event.totalCollected,
                jobPagesProcessed: event.totalCollected,
                phase: "list",
                currentUrl: `page ${event.pageNo}`,
              });
              updateProgress({
                step: "crawling",
                detail: `Adzuna: term ${event.termIndex}/${event.termTotal}, page ${event.pageNo} (${event.totalCollected} collected)`,
              });
              return;
            }

            progressHelpers.crawlingUpdate({
              source: "adzuna",
              termsProcessed: event.termIndex,
              termsTotal: event.termTotal,
              phase: "list",
              currentUrl: event.searchTerm,
            });
            updateProgress({
              step: "crawling",
              detail: `Adzuna: completed term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
            });
          },
        });

        if (!adzunaResult.success) {
          return {
            discoveredJobs: [],
            sourceErrors: [`adzuna: ${adzunaResult.error ?? "unknown error"}`],
          };
        }

        return {
          discoveredJobs: adzunaResult.jobs,
          sourceErrors: [],
        };
      },
    });
  }

  if (compatibleSources.includes("hiringcafe")) {
    sourceTasks.push({
      source: "hiringcafe",
      termsTotal: searchTerms.length,
      detail: "Hiring Cafe: fetching jobs...",
      run: async () => {
        const hiringCafeMaxJobsPerTerm = settings.jobspyResultsWanted
          ? parseInt(settings.jobspyResultsWanted, 10)
          : 200;

        const hiringCafeResult = await runHiringCafe({
          country: selectedCountry,
          countryKey: selectedCountry,
          locations: parseSearchCitiesSetting(
            settings.searchCities ?? settings.jobspyLocation,
          ),
          searchTerms,
          maxJobsPerTerm: hiringCafeMaxJobsPerTerm,
          onProgress: (event) => {
            if (event.type === "term_start") {
              progressHelpers.crawlingUpdate({
                source: "hiringcafe",
                termsProcessed: Math.max(event.termIndex - 1, 0),
                termsTotal: event.termTotal,
                phase: "list",
                currentUrl: event.searchTerm,
              });
              updateProgress({
                step: "crawling",
                detail: `Hiring Cafe: term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
              });
              return;
            }

            if (event.type === "page_fetched") {
              const displayPageNo = event.pageNo + 1;
              progressHelpers.crawlingUpdate({
                source: "hiringcafe",
                termsProcessed: Math.max(event.termIndex - 1, 0),
                termsTotal: event.termTotal,
                listPagesProcessed: displayPageNo,
                jobPagesEnqueued: event.totalCollected,
                jobPagesProcessed: event.totalCollected,
                phase: "list",
                currentUrl: `page ${displayPageNo}`,
              });
              updateProgress({
                step: "crawling",
                detail: `Hiring Cafe: term ${event.termIndex}/${event.termTotal}, page ${displayPageNo} (${event.totalCollected} collected)`,
              });
              return;
            }

            progressHelpers.crawlingUpdate({
              source: "hiringcafe",
              termsProcessed: event.termIndex,
              termsTotal: event.termTotal,
              phase: "list",
              currentUrl: event.searchTerm,
            });
            updateProgress({
              step: "crawling",
              detail: `Hiring Cafe: completed term ${event.termIndex}/${event.termTotal} (${event.searchTerm})`,
            });
          },
        });

        if (!hiringCafeResult.success) {
          return {
            discoveredJobs: [],
            sourceErrors: [
              `hiringcafe: ${hiringCafeResult.error ?? "unknown error"}`,
            ],
          };
        }

        return {
          discoveredJobs: hiringCafeResult.jobs,
          sourceErrors: [],
        };
      },
    });
  }

  if (compatibleSources.includes("gradcracker")) {
    sourceTasks.push({
      source: "gradcracker",
      detail: "Gradcracker: scraping...",
      run: async () => {
        const existingJobUrls = await jobsRepo.getAllJobUrls();
        const gradcrackerMaxJobs = settings.gradcrackerMaxJobsPerTerm
          ? parseInt(settings.gradcrackerMaxJobsPerTerm, 10)
          : 50;

        const crawlerResult = await runCrawler({
          existingJobUrls,
          searchTerms,
          maxJobsPerTerm: gradcrackerMaxJobs,
          onProgress: (progress) => {
            progressHelpers.crawlingUpdate({
              source: "gradcracker",
              listPagesProcessed: progress.listPagesProcessed,
              listPagesTotal: progress.listPagesTotal,
              jobCardsFound: progress.jobCardsFound,
              jobPagesEnqueued: progress.jobPagesEnqueued,
              jobPagesSkipped: progress.jobPagesSkipped,
              jobPagesProcessed: progress.jobPagesProcessed,
              phase: progress.phase,
              currentUrl: progress.currentUrl,
            });
          },
        });

        if (!crawlerResult.success) {
          return {
            discoveredJobs: [],
            sourceErrors: [
              `gradcracker: ${crawlerResult.error ?? "unknown error"}`,
            ],
          };
        }

        return {
          discoveredJobs: crawlerResult.jobs,
          sourceErrors: [],
        };
      },
    });
  }

  if (compatibleSources.includes("ukvisajobs")) {
    sourceTasks.push({
      source: "ukvisajobs",
      termsTotal: searchTerms.length,
      detail: "UKVisaJobs: scraping visa-sponsoring jobs...",
      run: async () => {
        const ukvisajobsMaxJobs = settings.ukvisajobsMaxJobs
          ? parseInt(settings.ukvisajobsMaxJobs, 10)
          : 50;

        const ukVisaResult = await runUkVisaJobs({
          maxJobs: ukvisajobsMaxJobs,
          searchTerms,
          onProgress: (event) => {
            if (event.type === "init") {
              progressHelpers.crawlingUpdate({
                source: "ukvisajobs",
                termsProcessed: Math.max(event.termIndex - 1, 0),
                termsTotal: event.termTotal,
                listPagesProcessed: 0,
                listPagesTotal: event.maxPages,
                jobPagesEnqueued: 0,
                jobPagesProcessed: 0,
                jobPagesSkipped: 0,
                phase: "list",
                currentUrl: event.searchTerm || "all jobs",
              });
              updateProgress({
                step: "crawling",
                detail: `UKVisaJobs: term ${event.termIndex}/${event.termTotal} (${event.searchTerm || "all jobs"})`,
              });
              return;
            }

            if (event.type === "page_fetched") {
              progressHelpers.crawlingUpdate({
                source: "ukvisajobs",
                termsProcessed: Math.max(event.termIndex - 1, 0),
                termsTotal: event.termTotal,
                listPagesProcessed: event.pageNo,
                listPagesTotal: event.maxPages,
                jobPagesEnqueued: event.totalCollected,
                jobPagesProcessed: event.totalCollected,
                phase: "list",
                currentUrl: `page ${event.pageNo}/${event.maxPages}`,
              });
              updateProgress({
                step: "crawling",
                detail: `UKVisaJobs: term ${event.termIndex}/${event.termTotal}, page ${event.pageNo}/${event.maxPages} (${event.totalCollected} collected)`,
              });
              return;
            }

            if (event.type === "term_complete") {
              progressHelpers.crawlingUpdate({
                source: "ukvisajobs",
                termsProcessed: event.termIndex,
                termsTotal: event.termTotal,
                phase: "list",
                currentUrl: event.searchTerm || "all jobs",
              });
              updateProgress({
                step: "crawling",
                detail: `UKVisaJobs: completed term ${event.termIndex}/${event.termTotal} (${event.searchTerm || "all jobs"})`,
              });
              return;
            }

            if (event.type === "empty_page") {
              updateProgress({
                step: "crawling",
                detail: `UKVisaJobs: page ${event.pageNo} returned no jobs`,
              });
              return;
            }

            if (event.type === "error") {
              updateProgress({
                step: "crawling",
                detail: `UKVisaJobs: ${event.message}`,
              });
            }
          },
        });

        if (!ukVisaResult.success) {
          return {
            discoveredJobs: [],
            sourceErrors: [
              `ukvisajobs: ${ukVisaResult.error ?? "unknown error"}`,
            ],
          };
        }

        return {
          discoveredJobs: ukVisaResult.jobs,
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

  if (args.shouldCancel?.()) {
    return { discoveredJobs, sourceErrors };
  }

  if (discoveredJobs.length === 0 && sourceErrors.length > 0) {
    throw new Error(`All sources failed: ${sourceErrors.join("; ")}`);
  }

  if (sourceErrors.length > 0) {
    logger.warn("Some discovery sources failed", { sourceErrors });
  }

  progressHelpers.crawlingComplete(discoveredJobs.length);

  return { discoveredJobs, sourceErrors };
}
