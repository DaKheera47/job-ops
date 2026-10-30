import {
  type AshbyBoard,
  type AshbyJob,
  ashbyBoardLabel,
  ashbyLocation,
  getAshbyBoard,
  getCursorJobLinks,
  parseAshbyUrl,
  resolveAshbySource,
} from "@career-boards/ashby";
import { ASHBY_JOB_ID } from "@career-boards/ashby/ashby-url";
import {
  notFound,
  requestTimeout,
  serviceUnavailable,
  upstreamError,
} from "@infra/errors";
import { getUserId } from "@infra/request-context";
import { sanitizeUnknown } from "@infra/sanitize";
import { getActiveTenantId } from "@server/tenancy/context";
import { buildLocationEvidence } from "@shared/location-intelligence";
import type { ManualJobDraft, WatchlistSelectedSource } from "@shared/types";
import PQueue from "p-queue";
import { z } from "zod";
import type { WatchlistCatalogSourceAdapter } from "./types";

const catalogSchema = z.object({
  label: z.string().trim().min(1).max(200),
  ashbyUrl: z.string().url().max(2000),
});
type BoardSnapshot = AshbyBoard & { companyLinks: Map<string, string> };
const cache = new Map<
  string,
  { value: BoardSnapshot; expiresAt: number; bytes: number }
>();
const inFlight = new Map<string, Promise<BoardSnapshot>>();
// Public requests share a concurrency budget; cached data is always tenant/user scoped.
const requests = new PQueue({ concurrency: 2 });

async function loadBoard(
  careersUrl: string,
  signal?: AbortSignal,
): Promise<BoardSnapshot> {
  if (signal?.aborted)
    throw requestTimeout("Ashby request timed out or was cancelled.");
  const userId = getUserId();
  if (!userId) throw new Error("User context is required for Ashby Watchlist.");
  const { board } = parseAshbyUrl(careersUrl);
  const key = JSON.stringify([getActiveTenantId(), userId, board]);
  for (const [entryKey, entry] of cache)
    if (entry.expiresAt <= Date.now()) cache.delete(entryKey);
  const saved = cache.get(key);
  if (saved) return saved.value;
  const pending = inFlight.get(key);
  if (pending) return pending;
  if (inFlight.size >= 100)
    throw serviceUnavailable("Ashby is busy. Try again shortly.");
  const promise = requests
    .add(
      async () => {
        const snapshot = await getAshbyBoard(careersUrl, signal);
        const companyLinks =
          board === "cursor"
            ? await getCursorJobLinks(signal)
            : new Map<string, string>();
        if (
          board === "cursor" &&
          snapshot.jobs.some((job) => !companyLinks.has(job.id))
        ) {
          throw new Error(
            "Cursor's public job links could not be verified. Try again later.",
          );
        }
        const value = { ...snapshot, companyLinks };
        const bytes = snapshot.jobs.reduce(
          (total, job) =>
            total +
            2 *
              (job.descriptionHtml.length + job.descriptionPlain.length + 4000),
          0,
        );
        cache.set(key, { value, expiresAt: Date.now() + 60_000, bytes });
        while (
          cache.size > 50 ||
          [...cache.values()].reduce((total, entry) => total + entry.bytes, 0) >
            64 * 1024 * 1024
        ) {
          const oldest = cache.keys().next().value;
          if (!oldest) break;
          cache.delete(oldest);
        }
        return value;
      },
      { signal },
    )
    .catch((error) => {
      if (signal?.aborted)
        throw requestTimeout("Ashby request timed out or was cancelled.");
      throw upstreamError("Could not load the public Ashby careers source.", {
        reason: sanitizeUnknown(error),
      });
    }) as Promise<BoardSnapshot>;
  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(key);
  }
}

async function findJob(
  source: WatchlistSelectedSource,
  jobRef: string,
  signal?: AbortSignal,
) {
  if (!ASHBY_JOB_ID.test(jobRef))
    throw notFound("Ashby posting was not found in the selected source.");
  const snapshot = await loadBoard(source.careersUrl, signal);
  const job = snapshot.jobs.find((item) => item.id === jobRef);
  if (!job)
    throw notFound("Ashby posting was not found in the selected source.");
  return { job, snapshot, ...jobLinks(snapshot, job) };
}

function jobLinks(snapshot: BoardSnapshot, job: AshbyJob) {
  const companyUrl = snapshot.companyLinks.get(job.id);
  return {
    jobUrl: companyUrl ?? job.jobUrl,
    applicationLink: companyUrl ? `${companyUrl}#apply` : job.applyUrl,
  };
}

export const ashbyWatchlistAdapter: WatchlistCatalogSourceAdapter = {
  sourceType: "ashby",
  descriptor: {
    sourceType: "ashby",
    label: "Ashby",
    catalogLabel: "Ashby company",
    customSourceOptionLabel: "Choose your own Ashby company",
    customSourceSearchText: "custom ashby company careers url",
    customSourceInputLabel: "Company careers page or Ashby URL",
    customSourcePlaceholder: "https://jobs.ashbyhq.com/company",
    customSourceHelpText:
      "Paste a public company careers page or an Ashby board, job, or application URL. Saving watches the whole board. If detection fails, paste the jobs.ashbyhq.com board URL.",
    emptyCatalogText: "No Ashby companies found.",
    fetchingLabel: "Fetching from Ashby...",
    invalidUrlMessage:
      "Couldn't resolve a public Ashby board. Try its jobs.ashbyhq.com URL",
    supportsCustomSource: true,
    supportsBranding: false,
  },
  catalogSchema,
  parseCatalogSources(entries) {
    return z
      .array(catalogSchema)
      .parse(entries)
      .map((entry) => {
        const { board, careersUrl } = parseAshbyUrl(entry.ashbyUrl);
        return {
          id: `ashby:${board}`,
          sourceType: "ashby",
          label: entry.label,
          careersUrl,
          cxsJobsUrl: null,
        };
      });
  },
  hydrateSelectedSource(source) {
    const { board, careersUrl } = parseAshbyUrl(source.careersUrl);
    return {
      ...source,
      careersUrl,
      cxsJobsUrl: null,
      label:
        source.label && source.label !== source.careersUrl
          ? source.label
          : ashbyBoardLabel(board),
    };
  },
  async normalizeCustomSelection(input) {
    const signal = AbortSignal.timeout(30_000);
    const resolved = await resolveAshbySource(input.careersUrl, signal);
    await loadBoard(resolved.careersUrl, signal);
    return {
      label:
        input.label?.trim() && input.label.trim() !== input.careersUrl.trim()
          ? input.label.trim()
          : ashbyBoardLabel(resolved.board),
      careersUrl: resolved.careersUrl,
    };
  },
  async fetchJobs({ source, signal }) {
    const snapshot = await loadBoard(source.careersUrl, signal);
    const jobs = snapshot.jobs.map((job) => ({
      jobRef: job.id,
      source: `ashby:${snapshot.board}`,
      sourceJobId: job.id,
      sourceType: "ashby",
      title: job.title,
      employer: source.label,
      ...jobLinks(snapshot, job),
      location: ashbyLocation(job),
      postedAt: job.publishedAt ?? null,
      isRemote:
        job.workplaceType === "Remote"
          ? true
          : ["Hybrid", "OnSite"].includes(job.workplaceType ?? "")
            ? false
            : undefined,
      locationEvidence: buildLocationEvidence({
        rawLocation: ashbyLocation(job),
        workplaceType: job.workplaceType,
        source: "ashby",
      }),
    }));
    return { total: jobs.length, fetched: jobs.length, jobs };
  },
  async fetchJobDetails({ source, jobRef, signal }) {
    const { job, jobUrl } = await findJob(source, jobRef, signal);
    return { jobRef, jobUrl, descriptionHtml: job.descriptionHtml };
  },
  async prepareImportDraft({ source, jobRef, signal }) {
    const { job, snapshot, jobUrl, applicationLink } = await findJob(
      source,
      jobRef,
      signal,
    );
    const draft: ManualJobDraft = {
      source: `ashby:${snapshot.board}`,
      sourceJobId: job.id,
      title: job.title,
      employer: source.label,
      jobUrl,
      applicationLink,
      location: ashbyLocation(job) ?? undefined,
      jobDescription: job.descriptionPlain,
      jobType: job.employmentType ?? undefined,
      jobFunction: job.team ?? job.department ?? undefined,
      salary:
        job.shouldDisplayCompensationOnJobPostings === true
          ? (job.compensation?.scrapeableCompensationSalarySummary ?? undefined)
          : undefined,
    };
    return {
      draft,
      source: draft.source ?? null,
      sourceHost: new URL(jobUrl).hostname,
    };
  },
};
