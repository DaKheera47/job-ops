import { Buffer } from "node:buffer";
import { XMLParser } from "fast-xml-parser";
import type { CreateJobInput } from "job-ops-shared/types/jobs";
import type { UpworkRssItem, UpworkRssPayload } from "./types";

const parser = new XMLParser({
  ignoreAttributes: false,
  trimValues: true,
});

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 10)),
    )
    .replace(/&#x([a-f0-9]+);/gi, (_, codePoint: string) =>
      String.fromCodePoint(Number.parseInt(codePoint, 16)),
    );
}

export function stripHtml(value: string): string {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function createSourceJobId(url: string): string {
  return Buffer.from(url).toString("base64url").slice(0, 16);
}

export function extractUpworkSalary(description: string): string | undefined {
  const patterns = [
    /\b(?:budget|hourly range|hourly|fixed-price)\s*:\s*([^.\n]+?)(?=\s+(?:posted on|category|skills|country|client|duration|experience|$))/i,
    /\$\s?\d[\d,]*(?:\.\d{2})?(?:\s*[-–]\s*\$?\s?\d[\d,]*(?:\.\d{2})?)?(?:\s*(?:\/hr|per hour|hourly))?/i,
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(description);
    const salary = match?.[1] ?? match?.[0];
    if (salary?.trim()) return salary.trim();
  }

  return undefined;
}

function getItems(payload: UpworkRssPayload): UpworkRssItem[] {
  const item = payload.rss?.channel?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

export function parseUpworkRss(xml: string): CreateJobInput[] {
  const payload = parser.parse(xml) as UpworkRssPayload;
  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();

  for (const item of getItems(payload)) {
    try {
      const title = asString(item.title);
      const jobUrl = asString(item.link);
      if (!title || !jobUrl) continue;

      const description = stripHtml(asString(item.description) ?? "");
      const sourceJobId =
        asString(item.guid) && !asString(item.guid)?.startsWith("http")
          ? asString(item.guid)
          : createSourceJobId(jobUrl);
      const dedupeKey = sourceJobId ?? jobUrl;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      jobs.push({
        source: "upwork",
        sourceJobId,
        title,
        employer: "Upwork Client",
        jobUrl,
        applicationLink: jobUrl,
        datePosted: normalizeDate(asString(item.pubDate)),
        salary: extractUpworkSalary(description),
        jobDescription: description || undefined,
        jobType: "Freelance / Contract",
        isRemote: true,
      });
    } catch {}
  }

  return jobs;
}
