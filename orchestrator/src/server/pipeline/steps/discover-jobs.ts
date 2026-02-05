import { logger } from "@infra/logger";
import type { CreateJobInput, PipelineConfig } from "@shared/types";
import * as jobsRepo from "../../repositories/jobs";
import * as settingsRepo from "../../repositories/settings";
import { runCrawler } from "../../services/crawler";
import { runJobSpy } from "../../services/jobspy";
import { runUkVisaJobs } from "../../services/ukvisajobs";
import { progressHelpers, updateProgress } from "../progress";

export async function discoverJobsStep(args: {
  mergedConfig: PipelineConfig;
}): Promise<{
  discoveredJobs: CreateJobInput[];
  sourceErrors: string[];
}> {
  logger.info("Running discovery step");
  progressHelpers.startCrawling();

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

  let jobSpySites = args.mergedConfig.sources.filter(
    (source): source is "indeed" | "linkedin" =>
      source === "indeed" || source === "linkedin",
  );

  const jobspySitesSettingRaw = settings.jobspySites;
  if (jobspySitesSettingRaw) {
    try {
      const allowed = JSON.parse(jobspySitesSettingRaw);
      if (Array.isArray(allowed)) {
        jobSpySites = jobSpySites.filter((site) => allowed.includes(site));
      }
    } catch {
      // ignore JSON parse error
    }
  }

  if (jobSpySites.length > 0) {
    updateProgress({
      step: "crawling",
      detail: `JobSpy: scraping ${jobSpySites.join(", ")}...`,
    });

    const jobSpyResult = await runJobSpy({
      sites: jobSpySites,
      searchTerms,
      location: settings.jobspyLocation ?? undefined,
      resultsWanted: settings.jobspyResultsWanted
        ? parseInt(settings.jobspyResultsWanted, 10)
        : undefined,
      hoursOld: settings.jobspyHoursOld
        ? parseInt(settings.jobspyHoursOld, 10)
        : undefined,
      countryIndeed: settings.jobspyCountryIndeed ?? undefined,
      linkedinFetchDescription:
        settings.jobspyLinkedinFetchDescription !== null &&
        settings.jobspyLinkedinFetchDescription !== undefined
          ? settings.jobspyLinkedinFetchDescription === "1"
          : undefined,
      isRemote:
        settings.jobspyIsRemote !== null &&
        settings.jobspyIsRemote !== undefined
          ? settings.jobspyIsRemote === "1"
          : undefined,
    });

    if (!jobSpyResult.success) {
      sourceErrors.push(`jobspy: ${jobSpyResult.error ?? "unknown error"}`);
    } else {
      discoveredJobs.push(...jobSpyResult.jobs);
    }
  }

  if (args.mergedConfig.sources.includes("gradcracker")) {
    updateProgress({ step: "crawling", detail: "Gradcracker: scraping..." });

    const existingJobUrls = await jobsRepo.getAllJobUrls();
    const gradcrackerMaxJobs = settings.gradcrackerMaxJobsPerTerm
      ? parseInt(settings.gradcrackerMaxJobsPerTerm, 10)
      : 50;

    const crawlerResult = await runCrawler({
      existingJobUrls,
      searchTerms,
      maxJobsPerTerm: gradcrackerMaxJobs,
      onProgress: (progress) => {
        if (progress.listPagesTotal && progress.listPagesTotal > 0) {
          const percent = Math.round(
            ((progress.listPagesProcessed ?? 0) / progress.listPagesTotal) *
              100,
          );
          updateProgress({
            step: "crawling",
            detail: `Gradcracker: ${percent}% (scan ${progress.listPagesProcessed}/${progress.listPagesTotal}, found ${progress.jobCardsFound})`,
          });
        }
      },
    });

    if (!crawlerResult.success) {
      sourceErrors.push(
        `gradcracker: ${crawlerResult.error ?? "unknown error"}`,
      );
    } else {
      discoveredJobs.push(...crawlerResult.jobs);
    }
  }

  if (args.mergedConfig.sources.includes("ukvisajobs")) {
    updateProgress({
      step: "crawling",
      detail: "UKVisaJobs: scraping visa-sponsoring jobs...",
    });

    const ukvisajobsMaxJobs = settings.ukvisajobsMaxJobs
      ? parseInt(settings.ukvisajobsMaxJobs, 10)
      : 50;

    const ukVisaResult = await runUkVisaJobs({
      maxJobs: ukvisajobsMaxJobs,
      searchTerms,
    });

    if (!ukVisaResult.success) {
      sourceErrors.push(`ukvisajobs: ${ukVisaResult.error ?? "unknown error"}`);
    } else {
      discoveredJobs.push(...ukVisaResult.jobs);
    }
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
