/**
 * We Work Remotely extractor — public RSS feeds at weworkremotely.com.
 * No auth required. 100% remote. Returns last 50-100 listings per category.
 *
 * Uses the all-categories combined feed `weworkremotely.com/remote-jobs.rss`
 * to maximise coverage in a single request.
 */

import type { CreateJobInput } from "@shared/types/jobs";
import { createRateLimitedFetch } from "@shared/utils/rate-limited-fetch";

const WWR_FEED_URL = "https://weworkremotely.com/remote-jobs.rss";
const DEFAULT_MAX_PER_TERM = 50;

export type WwrWorkplaceType = "remote" | "hybrid" | "onsite";

export type WwrProgressEvent =
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

export interface RunWwrOptions {
  searchTerms?: string[];
  workplaceTypes?: WwrWorkplaceType[];
  maxJobsPerTerm?: number;
  onProgress?: (event: WwrProgressEvent) => void;
  shouldCancel?: () => boolean;
  fetchImpl?: typeof fetch;
}

export interface WwrResult {
  success: boolean;
  jobs: CreateJobInput[];
  error?: string;
}

interface WwrItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
  category?: string;
  guid?: string;
  region?: string;
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripHtml(value: string): string {
  return decodeXmlEntities(
    value
      .replace(/<\/(p|div|li|br|h[1-6])\s*>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

function extractTagValue(itemXml: string, tag: string): string | undefined {
  // CDATA-wrapped: <tag><![CDATA[...]]></tag>
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i",
  );
  const cdataMatch = itemXml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const plainRegex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const plainMatch = itemXml.match(plainRegex);
  if (plainMatch) return decodeXmlEntities(plainMatch[1]).trim();

  return undefined;
}

function parseRssItems(xml: string): WwrItem[] {
  const items: WwrItem[] = [];
  const itemRegex = /<item\b[\s\S]*?<\/item>/gi;
  for (const match of xml.matchAll(itemRegex)) {
    const itemXml = match[0];
    const title = extractTagValue(itemXml, "title");
    const link = extractTagValue(itemXml, "link");
    const description = extractTagValue(itemXml, "description");
    if (!title || !link) continue;
    items.push({
      title,
      link,
      description: description ?? "",
      pubDate: extractTagValue(itemXml, "pubDate"),
      category: extractTagValue(itemXml, "category"),
      guid: extractTagValue(itemXml, "guid"),
      region: extractTagValue(itemXml, "region"),
    });
  }
  return items;
}

function workplaceMatches(
  workplaceTypes: WwrWorkplaceType[] | undefined,
): boolean {
  if (!workplaceTypes || workplaceTypes.length === 0) return true;
  return workplaceTypes.includes("remote");
}

function splitTitle(rawTitle: string): { employer: string; jobTitle: string } {
  // WWR format: "Company: Job Title"
  const colonIdx = rawTitle.indexOf(":");
  if (colonIdx > 0 && colonIdx < rawTitle.length - 1) {
    return {
      employer: rawTitle.slice(0, colonIdx).trim(),
      jobTitle: rawTitle.slice(colonIdx + 1).trim(),
    };
  }
  return { employer: "Unknown Employer", jobTitle: rawTitle.trim() };
}

function mapItem(item: WwrItem): CreateJobInput | null {
  const { employer, jobTitle } = splitTitle(item.title);
  if (!jobTitle) return null;

  const description = stripHtml(item.description);
  const region = item.region ?? "Anywhere";

  return {
    source: "weworkremotely",
    sourceJobId: item.guid,
    title: jobTitle,
    employer,
    jobUrl: item.link,
    applicationLink: item.link,
    location: region,
    locationEvidence: { location: region, source: "weworkremotely" },
    jobDescription: description || undefined,
    datePosted: item.pubDate,
    jobType: "Full-time",
    jobFunction: item.category,
    isRemote: true,
  };
}

function matchesSearchTerm(item: WwrItem, searchTerm: string): boolean {
  const normalized = searchTerm.toLowerCase().trim();
  if (!normalized) return true;
  const haystack =
    `${item.title} ${item.description} ${item.category ?? ""}`.toLowerCase();
  return normalized
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

async function fetchFeed(fetchImpl: typeof fetch): Promise<WwrItem[]> {
  const response = await fetchImpl(WWR_FEED_URL, {
    method: "GET",
    headers: {
      accept: "application/rss+xml, application/xml, text/xml",
      "user-agent": "JobOps/1.0 (+https://github.com/dakheera47/job-ops)",
    },
  });
  if (!response.ok) {
    throw new Error(`WeWorkRemotely RSS fetch failed with ${response.status}`);
  }
  const xml = await response.text();
  return parseRssItems(xml);
}

export async function runWeWorkRemotely(
  options: RunWwrOptions = {},
): Promise<WwrResult> {
  if (!workplaceMatches(options.workplaceTypes)) {
    return { success: true, jobs: [] };
  }

  const fetchImpl =
    options.fetchImpl ?? createRateLimitedFetch("weworkremotely");
  const searchTerms =
    options.searchTerms && options.searchTerms.length > 0
      ? options.searchTerms
      : ["software engineer"];
  const maxJobsPerTerm = Math.max(
    1,
    Math.min(200, options.maxJobsPerTerm ?? DEFAULT_MAX_PER_TERM),
  );

  try {
    const all = await fetchFeed(fetchImpl);
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
      for (const item of all) {
        if (options.shouldCancel?.()) return { success: true, jobs };
        if (jobsFoundTerm >= maxJobsPerTerm) break;
        if (!matchesSearchTerm(item, searchTerm)) continue;
        const mapped = mapItem(item);
        if (!mapped) continue;
        const dedupeKey = mapped.sourceJobId ?? mapped.jobUrl;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        jobs.push(mapped);
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
          : "Unexpected error while running WeWorkRemotely extractor.";
    return { success: false, jobs: [], error: message };
  }
}
