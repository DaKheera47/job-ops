/**
 * Hacker News "Who is hiring?" extractor — pulls the latest monthly thread
 * (or the last N threads) from kepler9d's account `whoishiring` via the
 * Algolia HN search API, then extracts each top-level comment as a job.
 *
 * Algolia endpoints used:
 *   - Find threads:
 *       https://hn.algolia.com/api/v1/search?tags=story,author_whoishiring
 *       &query=hiring&hitsPerPage=10
 *   - Pull comments for a story:
 *       https://hn.algolia.com/api/v1/search?tags=comment,story_<id>
 *       &hitsPerPage=1000
 *
 * The thread title we want looks like "Ask HN: Who is hiring? (May 2026)".
 * We deliberately ignore "Who wants to be hired" and "Freelancer? Seeking
 * freelancer?" threads from the same author.
 */

import type { CreateJobInput } from "@shared/types/jobs";
import { createRateLimitedFetch } from "@shared/utils/rate-limited-fetch";
import { termMatchesHaystack } from "@shared/utils/term-match";
import { parseHnComment } from "./parser";

const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";
// 100 vacancies × N search terms is plenty — the user normally cares about
// the most-recent thread, and older threads decay in relevance fast.
const DEFAULT_MAX_PER_TERM = 100;
const DEFAULT_THREAD_COUNT = 2;
const DEFAULT_COMMENTS_PER_THREAD = 1000;

export type HnWorkplaceType = "remote" | "hybrid" | "onsite";

export type HnProgressEvent =
  | {
      type: "term_start";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
    }
  | {
      type: "term_complete";
      termIndex: number;
      termTotal: number;
      searchTerm: string;
      jobsFoundTerm: number;
    };

export interface RunHnOptions {
  searchTerms?: string[];
  workplaceTypes?: HnWorkplaceType[];
  maxJobsPerTerm?: number;
  threadCount?: number;
  onProgress?: (event: HnProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface HnResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

interface AlgoliaStoryHit {
  objectID: string;
  title?: string;
  created_at_i?: number;
  author?: string;
}

interface AlgoliaCommentHit {
  objectID: string;
  comment_text?: string;
  created_at?: string;
  parent_id?: number;
  story_id?: number;
}

interface AlgoliaResponse<T> {
  hits?: T[];
}

const IGNORED_THREAD_RE = /(seeking freelancer|wants to be hired|freelancer)/i;
const WHO_IS_HIRING_RE = /\bwho is hiring\b/i;

function workplaceMatches(workplaceTypes: HnWorkplaceType[] | undefined): boolean {
  if (!workplaceTypes || workplaceTypes.length === 0) return true;
  return workplaceTypes.includes("remote");
}

async function fetchLatestThreads(
  fetchImpl: typeof fetch,
  count: number,
): Promise<AlgoliaStoryHit[]> {
  // `/search_by_date` sorts hits by created_at desc — the default `/search`
  // endpoint sorts by relevance and we'd otherwise get historical threads
  // from 2018-2020 instead of the most recent month.
  const url = `${ALGOLIA_BASE}/search_by_date?tags=story,author_whoishiring&hitsPerPage=20`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`HN Algolia stories request failed with ${res.status}`);
  }
  const payload = (await res.json()) as AlgoliaResponse<AlgoliaStoryHit>;
  const hits = Array.isArray(payload.hits) ? payload.hits : [];
  return hits
    .filter((h) => {
      const t = h.title ?? "";
      return WHO_IS_HIRING_RE.test(t) && !IGNORED_THREAD_RE.test(t);
    })
    .sort((a, b) => (b.created_at_i ?? 0) - (a.created_at_i ?? 0))
    .slice(0, count);
}

async function fetchCommentsForThread(
  fetchImpl: typeof fetch,
  storyId: string,
  hitsPerPage: number,
): Promise<AlgoliaCommentHit[]> {
  const url = `${ALGOLIA_BASE}/search?tags=comment,story_${encodeURIComponent(
    storyId,
  )}&hitsPerPage=${hitsPerPage}`;
  const res = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(
      `HN Algolia comments request failed with ${res.status} for story ${storyId}`,
    );
  }
  const payload = (await res.json()) as AlgoliaResponse<AlgoliaCommentHit>;
  return Array.isArray(payload.hits) ? payload.hits : [];
}

function buildJobInput(
  hit: AlgoliaCommentHit,
  parsed: NonNullable<ReturnType<typeof parseHnComment>>,
): CreateJobInput {
  const jobUrl = `https://news.ycombinator.com/item?id=${hit.objectID}`;
  return {
    source: "hackernews",
    sourceJobId: hit.objectID,
    title: parsed.title,
    employer: parsed.company,
    jobUrl,
    applicationLink: jobUrl,
    location: parsed.location || (parsed.isRemote ? "Remote" : ""),
    locationEvidence: {
      location: parsed.location || (parsed.isRemote ? "Remote" : null),
      source: "hackernews",
    },
    jobDescription: parsed.description,
    datePosted: hit.created_at,
    jobType: "Full-time",
    isRemote: parsed.isRemote,
  };
}

export async function runHackerNews(
  options: RunHnOptions = {},
): Promise<HnResult> {
  if (!workplaceMatches(options.workplaceTypes)) {
    return { success: true, jobs: [] };
  }

  const fetchImpl = options.fetchImpl ?? createRateLimitedFetch("hackernews");
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = Math.max(
    1,
    Math.min(500, options.maxJobsPerTerm ?? DEFAULT_MAX_PER_TERM),
  );
  const threadCount = Math.max(
    1,
    Math.min(6, options.threadCount ?? DEFAULT_THREAD_COUNT),
  );

  try {
    const threads = await fetchLatestThreads(fetchImpl, threadCount);
    if (threads.length === 0) {
      return { success: true, jobs: [] };
    }
    if (options.shouldCancel?.()) return { success: true, jobs: [] };

    // Pull comments for all selected threads and parse once — we then match
    // each search term against the cached parsed list rather than re-fetching.
    const allParsed: Array<{
      hit: AlgoliaCommentHit;
      parsed: NonNullable<ReturnType<typeof parseHnComment>>;
    }> = [];
    for (const thread of threads) {
      if (options.shouldCancel?.()) return { success: true, jobs: [] };
      const comments = await fetchCommentsForThread(
        fetchImpl,
        thread.objectID,
        DEFAULT_COMMENTS_PER_THREAD,
      );
      for (const hit of comments) {
        // Only top-level comments are job postings (parent_id === story_id).
        if (
          hit.parent_id !== undefined &&
          hit.story_id !== undefined &&
          hit.parent_id !== hit.story_id
        ) {
          continue;
        }
        if (!hit.comment_text) continue;
        const parsed = parseHnComment(hit.comment_text);
        if (!parsed) continue;
        // We only auto-ingest remote postings — onsite roles from HN have no
        // place in a "remote-friendly worldwide" pipeline.
        if (!parsed.isRemote) continue;
        allParsed.push({ hit, parsed });
      }
    }

    const jobs: CreateJobInput[] = [];
    const seen = new Set<string>();

    for (const [index, searchTerm] of searchTerms.entries()) {
      if (options.shouldCancel?.()) return { success: true, jobs };

      options.onProgress?.({
        type: "term_start",
        termIndex: index + 1,
        termTotal: searchTerms.length,
        searchTerm,
      });

      let jobsFoundTerm = 0;
      for (const { hit, parsed } of allParsed) {
        if (options.shouldCancel?.()) return { success: true, jobs };
        if (jobsFoundTerm >= maxJobsPerTerm) break;
        const haystack = `${parsed.title} ${parsed.company} ${parsed.fullText}`;
        if (!termMatchesHaystack(haystack, searchTerm)) continue;
        if (seen.has(hit.objectID)) continue;
        seen.add(hit.objectID);
        jobs.push(buildJobInput(hit, parsed));
        jobsFoundTerm += 1;
      }

      options.onProgress?.({
        type: "term_complete",
        termIndex: index + 1,
        termTotal: searchTerms.length,
        searchTerm,
        jobsFoundTerm,
      });
    }

    return { success: true, jobs };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : typeof error === "string"
          ? error
          : "Unexpected error while running HN extractor.";
    return { success: false, jobs: [], error: message };
  }
}
