import {
  getJobDetails,
  getJobsFromBoard,
  greenhouseTokenToLabel,
  greenhouseTokenToSourceKey,
  greenhouseUrlToSourceKey,
  type NormalizedGreenhouseJob,
  parseGreenhouseUrl,
  resolveGreenhouseSource,
} from "@career-boards/greenhouse";
import type { ManualJobDraft, WatchlistSelectedSource } from "@shared/types";
import { z } from "zod";
import type { WatchlistCatalogSourceAdapter } from "./types";

const GREENHOUSE_WATCHLIST_MAX_JOBS = 40;

const greenhouseSourceSchema = z.object({
  label: z.string().trim().min(1).max(200),
  greenhouseUrl: z.string().trim().url().max(2000),
});

export const greenhouseWatchlistAdapter: WatchlistCatalogSourceAdapter = {
  sourceType: "greenhouse",
  descriptor: {
    sourceType: "greenhouse",
    label: "Greenhouse",
    catalogLabel: "Greenhouse company",
    customSourceOptionLabel: "Choose your own Greenhouse company",
    customSourceSearchText: "custom greenhouse url",
    customSourceInputLabel: "Company careers page or Greenhouse URL",
    customSourcePlaceholder: "https://www.company.com/careers",
    customSourceHelpText:
      "Paste the company's careers page and we'll find its Greenhouse board " +
      "automatically. If that fails, paste the board directly: go to " +
      "job-boards.greenhouse.io/ + the company name (e.g. 'riotgames'), or " +
      "open a job posting, click Apply, and copy the greenhouse.io link.",
    emptyCatalogText: "No Greenhouse companies found.",
    fetchingLabel: "Fetching from Greenhouse...",
    invalidUrlMessage:
      "Couldn't find a Greenhouse job board for that URL. Try pasting the " +
      "board directly, e.g. https://job-boards.greenhouse.io/companyname",
    supportsCustomSource: true,
    supportsBranding: false,
  },
  catalogSchema: greenhouseSourceSchema,
  parseCatalogSources(entries) {
    return z
      .array(greenhouseSourceSchema)
      .parse(entries)
      .map((entry) => {
        const parsed = parseGreenhouseUrl(entry.greenhouseUrl);
        return {
          id: buildSourceId(parsed.token),
          label: entry.label,
          sourceType: "greenhouse",
          careersUrl: parsed.canonicalCareersUrl,
          cxsJobsUrl: null,
        };
      });
  },
  hydrateSelectedSource(source) {
    const parsed = parseGreenhouseUrl(source.careersUrl);
    return {
      ...source,
      label: getHydratedGreenhouseLabel(source, parsed.token),
      careersUrl: parsed.canonicalCareersUrl,
      cxsJobsUrl: null,
    };
  },
  async normalizeCustomSelection(input) {
    const resolved = await resolveGreenhouseSource({ url: input.careersUrl });
    const trimmedLabel = input.label?.trim();
    const label =
      trimmedLabel && trimmedLabel !== input.careersUrl.trim()
        ? trimmedLabel
        : (resolved.companyName ?? greenhouseTokenToLabel(resolved.token));

    return {
      label,
      careersUrl: resolved.canonicalCareersUrl,
    };
  },
  async fetchJobs(input) {
    const response = await getJobsFromBoard({
      careersUrl: input.source.careersUrl,
      signal: input.signal,
    });
    const source = greenhouseUrlToSourceKey(input.source.careersUrl);
    const jobs = response.jobs
      .slice(0, GREENHOUSE_WATCHLIST_MAX_JOBS)
      .map((job) => normalizeGreenhouseJob(input.source, source, job));

    return {
      total: response.total,
      fetched: jobs.length,
      jobs,
    };
  },
  async fetchJobDetails(input) {
    const details = await getJobDetails({
      jobRef: input.jobRef,
      signal: input.signal,
    });
    return {
      jobRef: input.jobRef,
      jobUrl: details.job.jobUrl,
      descriptionHtml: details.job.jobDescriptionHtml,
    };
  },
  async prepareImportDraft(input) {
    const details = await getJobDetails({
      jobRef: input.jobRef,
      signal: input.signal,
    });
    const source = greenhouseTokenToSourceKey(
      parseGreenhouseUrl(input.source.careersUrl).token,
    );
    const draft = buildManualDraft(input.source, source, details.job);

    return {
      draft,
      source: draft.source ?? null,
      sourceHost:
        getSourceHost(details.job.jobUrl) ??
        getSourceHost(input.source.careersUrl),
    };
  },
};

function buildSourceId(token: string): string {
  return `greenhouse:${token}`;
}

function getHydratedGreenhouseLabel(
  source: {
    sourceType: string;
    label: string;
    careersUrl: string;
  },
  token: string,
): string {
  if (
    source.sourceType === "greenhouse" &&
    (!source.label.trim() || source.label.trim() === source.careersUrl.trim())
  ) {
    return greenhouseTokenToLabel(token);
  }

  return source.label;
}

function normalizeGreenhouseJob(
  selectedSource: WatchlistSelectedSource,
  source: string,
  job: NormalizedGreenhouseJob,
) {
  return {
    jobRef: job.jobApiUrl,
    source,
    sourceJobId: job.externalId,
    sourceType: selectedSource.sourceType,
    title: job.title,
    employer: job.company ?? selectedSource.label,
    jobUrl: job.jobUrl,
    applicationLink: job.jobUrl,
    location: job.locationText ?? null,
    postedAt: job.postedOn ?? null,
  };
}

function buildManualDraft(
  selectedSource: WatchlistSelectedSource,
  source: string,
  details: {
    externalId: string;
    title: string;
    company?: string;
    locationText?: string;
    jobDescriptionText: string;
    jobUrl: string;
  },
): ManualJobDraft {
  return {
    source,
    sourceJobId: details.externalId,
    title: details.title,
    employer: details.company ?? selectedSource.label,
    jobUrl: details.jobUrl,
    applicationLink: details.jobUrl,
    location: details.locationText,
    jobDescription: details.jobDescriptionText,
  };
}

function getSourceHost(value: string): string | null {
  try {
    return new URL(value).hostname || null;
  } catch {
    return null;
  }
}
