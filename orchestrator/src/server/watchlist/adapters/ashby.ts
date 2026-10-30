import {
  notFound,
  requestTimeout,
  serviceUnavailable,
  upstreamError,
} from "@infra/errors";
import { getUserId } from "@infra/request-context";
import { sanitizeUnknown } from "@infra/sanitize";
import { getActiveTenantId } from "@server/tenancy/context";
import {
  ASHBY_API_ORIGIN,
  ASHBY_JOB_ID,
  ASHBY_JOBS_ORIGIN,
  ashbyBoardLabel,
  parseAshbyUrl,
} from "@shared/ashby";
import { buildLocationEvidence } from "@shared/location-intelligence";
import type { WatchlistSelectedSource } from "@shared/types";
import PQueue from "p-queue";
import { z } from "zod";
import { readPublicAshbyUrl } from "../ashby-http";
import { getCursorJobLinks, resolveAshbySource } from "../ashby-source";
import type { WatchlistCatalogSourceAdapter } from "./types";

const address = z.object({
  addressLocality: z.string().max(2000).nullish(),
  addressRegion: z.string().max(2000).nullish(),
  addressCountry: z.string().max(2000).nullish(),
});
const location = z.object({
  location: z.string().max(2000).nullish(),
  address: address.nullish(),
});
const posting = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(1000),
  isListed: z.boolean(),
  descriptionHtml: z.string().max(1024 * 1024),
  descriptionPlain: z.string().max(1024 * 1024),
  location: z.string().max(2000).nullish(),
  address: z.object({ postalAddress: address.nullish() }).nullish(),
  secondaryLocations: z.array(location).max(1000).nullish(),
  workplaceType: z.string().nullish(),
  publishedAt: z.string().nullish(),
  employmentType: z.string().nullish(),
  department: z.string().nullish(),
  team: z.string().nullish(),
  shouldDisplayCompensationOnJobPostings: z.boolean().nullish(),
  compensation: z
    .object({ scrapeableCompensationSalarySummary: z.string().nullish() })
    .nullish(),
});
const feed = z.object({ apiVersion: z.literal("1"), jobs: z.array(posting) });
const catalogSchema = z.object({
  label: z.string().trim().min(1).max(200),
  ashbyUrl: z.string().url().max(2000),
});
type Job = z.infer<typeof posting>;
type Snapshot = { board: string; jobs: Job[]; links: Map<string, string> };
type CachedBoard = {
  expires: number;
  bytes: number;
  promise: Promise<Snapshot>;
};
const boards = new Map<string, CachedBoard>();
const requests = new PQueue({ concurrency: 2 });

async function fetchBoard(
  board: string,
  signal?: AbortSignal,
): Promise<Snapshot> {
  const response = await readPublicAshbyUrl(
    `${ASHBY_API_ORIGIN}/posting-api/job-board/${board}?includeCompensation=true`,
    { signal, maxBytes: 25 * 1024 * 1024, accept: "application/json" },
  );
  let payload: unknown;
  try {
    payload = JSON.parse(response.text);
  } catch {
    throw new Error("Ashby returned invalid JSON.");
  }
  const parsed = feed.safeParse(payload);
  if (!parsed.success)
    throw new Error("Ashby returned an invalid or unsupported job feed.");
  // URLs are derived from the validated board/UUID, never accepted from the feed.
  const jobs = [
    ...new Map(
      parsed.data.jobs
        .filter((job) => job.isListed)
        .map((job) => [job.id, job]),
    ).values(),
  ];
  const links =
    board === "cursor"
      ? await getCursorJobLinks(signal)
      : new Map<string, string>();
  if (board === "cursor" && jobs.some((job) => !links.has(job.id)))
    throw new Error("Cursor's public job links could not be verified.");
  return { board, jobs, links };
}

function loadBoard(
  careersUrl: string,
  signal?: AbortSignal,
): Promise<Snapshot> {
  if (signal?.aborted)
    throw requestTimeout("Ashby request timed out or was cancelled.");
  const userId = getUserId();
  if (!userId) throw new Error("User context is required for Ashby Watchlist.");
  const { board } = parseAshbyUrl(careersUrl);
  const key = JSON.stringify([getActiveTenantId(), userId, board]);
  for (const [id, entry] of boards)
    if (entry.expires <= Date.now()) boards.delete(id);
  const cached = boards.get(key);
  if (cached) return cached.promise;
  if (boards.size >= 50) {
    const oldest = [...boards].find(([, item]) => item.bytes > 0);
    if (!oldest) throw serviceUnavailable("Ashby is busy. Try again shortly.");
    boards.delete(oldest[0]);
  }
  const entry: CachedBoard = {
    expires: Date.now() + 60_000,
    bytes: 0,
    promise: requests
      .add(
        async () => {
          const result = await fetchBoard(board, signal);
          entry.expires = Date.now() + 60_000;
          entry.bytes =
            2 * JSON.stringify([result.jobs, [...result.links]]).length +
            result.jobs.length * 1024;
          while (
            [...boards.values()].reduce(
              (total, item) => total + item.bytes,
              0,
            ) >
            64 * 1024 * 1024
          ) {
            const oldest = [...boards].find(([, item]) => item.bytes > 0);
            if (oldest) boards.delete(oldest[0]);
          }
          return result;
        },
        { signal, throwOnTimeout: true },
      )
      .catch((error) => {
        if (boards.get(key) === entry) boards.delete(key);
        if (signal?.aborted)
          throw requestTimeout("Ashby request timed out or was cancelled.");
        throw upstreamError("Could not load the public Ashby careers source.", {
          reason: sanitizeUnknown(error),
        });
      }),
  };
  boards.set(key, entry);
  return entry.promise;
}

function jobData(
  source: WatchlistSelectedSource,
  snapshot: Snapshot,
  job: Job,
) {
  const companyUrl = snapshot.links.get(job.id);
  const places = [
    { location: job.location, address: job.address?.postalAddress },
    ...(job.secondaryLocations ?? []),
  ].map((place) => {
    const parts = place.location?.trim()
      ? [place.location.trim()]
      : [place.address?.addressLocality, place.address?.addressRegion].filter(
          Boolean,
        );
    const country = place.address?.addressCountry?.trim();
    if (
      country &&
      !parts.some((part) =>
        part
          ?.split(/[,;]/)
          .some((item) => item.trim().toLowerCase() === country.toLowerCase()),
      )
    )
      parts.push(country);
    return parts.join(", ");
  });
  return {
    source: `ashby:${snapshot.board}`,
    sourceJobId: job.id,
    title: job.title,
    employer: source.label,
    jobUrl: companyUrl ?? `${ASHBY_JOBS_ORIGIN}/${snapshot.board}/${job.id}`,
    applicationLink: companyUrl
      ? `${companyUrl}#apply`
      : `${ASHBY_JOBS_ORIGIN}/${snapshot.board}/${job.id}/application`,
    location:
      [
        job.workplaceType === "OnSite"
          ? "On-site"
          : ["Remote", "Hybrid"].includes(job.workplaceType ?? "")
            ? job.workplaceType
            : null,
        ...new Set(places),
      ]
        .filter(Boolean)
        .join("; ") || null,
  };
}

async function findJob(
  source: WatchlistSelectedSource,
  id: string,
  signal?: AbortSignal,
) {
  if (!ASHBY_JOB_ID.test(id))
    throw notFound("Ashby posting was not found in the selected source.");
  const snapshot = await loadBoard(source.careersUrl, signal);
  const job = snapshot.jobs.find((item) => item.id === id);
  if (!job)
    throw notFound("Ashby posting was not found in the selected source.");
  return { job, data: jobData(source, snapshot, job) };
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
      .map(({ label, ashbyUrl }) => {
        const { board, careersUrl } = parseAshbyUrl(ashbyUrl);
        return {
          id: `ashby:${board}`,
          sourceType: "ashby",
          label,
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
    const { board, careersUrl } = await resolveAshbySource(
      input.careersUrl,
      signal,
    );
    await loadBoard(careersUrl, signal);
    return {
      careersUrl,
      label:
        input.label?.trim() && input.label.trim() !== input.careersUrl.trim()
          ? input.label.trim()
          : ashbyBoardLabel(board),
    };
  },
  async fetchJobs({ source, signal }) {
    const snapshot = await loadBoard(source.careersUrl, signal);
    const jobs = snapshot.jobs.map((job) => {
      const data = jobData(source, snapshot, job);
      return {
        ...data,
        jobRef: job.id,
        sourceType: "ashby",
        postedAt: job.publishedAt ?? null,
        isRemote:
          job.workplaceType === "Remote"
            ? true
            : ["Hybrid", "OnSite"].includes(job.workplaceType ?? "")
              ? false
              : undefined,
        locationEvidence: buildLocationEvidence({
          rawLocation: data.location,
          workplaceType: job.workplaceType,
          source: "ashby",
        }),
      };
    });
    return { total: jobs.length, fetched: jobs.length, jobs };
  },
  async fetchJobDetails({ source, jobRef, signal }) {
    const { job, data } = await findJob(source, jobRef, signal);
    return {
      jobRef,
      jobUrl: data.jobUrl,
      descriptionHtml: job.descriptionHtml,
    };
  },
  async prepareImportDraft({ source, jobRef, signal }) {
    const { job, data } = await findJob(source, jobRef, signal);
    return {
      source: data.source,
      sourceHost: new URL(data.jobUrl).hostname,
      draft: {
        ...data,
        location: data.location ?? undefined,
        jobDescription: job.descriptionPlain,
        jobType: job.employmentType ?? undefined,
        jobFunction: job.team ?? job.department ?? undefined,
        salary:
          job.shouldDisplayCompensationOnJobPostings === true
            ? (job.compensation?.scrapeableCompensationSalarySummary ??
              undefined)
            : undefined,
      },
    };
  },
};
