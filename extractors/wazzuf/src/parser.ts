import { Buffer } from "node:buffer";
import type { Cheerio, CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { CreateJobInput } from "job-ops-shared/types/jobs";

const WUZZUF_ORIGIN = "https://wuzzuf.net";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstText(
  root: Cheerio<AnyNode>,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const text = normalizeWhitespace(root.find(selector).first().text());
    if (text) return text.replace(/\s*-\s*$/, "").trim();
  }

  return undefined;
}

function normalizeUrl(href: string): string {
  return new URL(href, WUZZUF_ORIGIN).toString();
}

function createSourceJobId(url: string): string {
  const parsed = new URL(url);
  const pathId = /\/jobs\/p\/([^/?#]+)/i.exec(parsed.pathname)?.[1];
  return pathId
    ? decodeURIComponent(pathId).slice(0, 80)
    : Buffer.from(url).toString("base64url").slice(0, 16);
}

function normalizeDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function extractJobType(text: string): string | undefined {
  const patterns: Array<[RegExp, string]> = [
    [/\bfull[-\s]?time\b/i, "Full-time"],
    [/\bpart[-\s]?time\b/i, "Part-time"],
    [/\bcontract\b/i, "Contract"],
    [/\binternship\b/i, "Internship"],
    [/\bfreelance\b/i, "Freelance"],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(text)) return label;
  }

  return undefined;
}

function extractSkills(
  $: CheerioAPI,
  root: Cheerio<AnyNode>,
): string | undefined {
  const skills = root
    .find('a[href*="/jobs/"], span, .tag')
    .map((_, element) => normalizeWhitespace($(element).text()))
    .get()
    .filter((value) => value.length > 1)
    .filter(
      (value) =>
        !/full[-\s]?time|part[-\s]?time|internship|contract|freelance/i.test(
          value,
        ),
    );
  const unique = [...new Set(skills)].slice(0, 12);
  return unique.length > 0 ? unique.join(", ") : undefined;
}

export function parseWazzufJobs(html: string): CreateJobInput[] {
  const $ = cheerio.load(html);
  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();
  const anchors = $('a[href*="/jobs/p/"]').filter((_, element) => {
    const text = normalizeWhitespace($(element).text());
    return text.length > 0;
  });

  anchors.each((_, anchor) => {
    try {
      const href = $(anchor).attr("href");
      const title = normalizeWhitespace($(anchor).text());
      if (!href || !title) return;

      const jobUrl = normalizeUrl(href);
      if (seen.has(jobUrl)) return;
      seen.add(jobUrl);

      const rootCandidate = $(anchor).closest(
        'article, li, div[data-testid*="job"], .job-card, .css-1gatmva, .css-pkv5jc',
      );
      const root =
        rootCandidate.length > 0 ? rootCandidate : $(anchor).parent();
      const rootText = normalizeWhitespace(root.text());
      const employer =
        firstText(root, [
          '[data-testid="company-name"]',
          'a[href*="/jobs/careers/"]',
          'span[itemprop="name"]',
          ".company-name",
          '[class*="company"]',
        ]) ?? "Unknown Employer";
      const location = firstText(root, [
        '[data-testid="job-location"]',
        ".job-location",
        'span[itemprop="addressLocality"]',
        '[class*="location"]',
      ]);
      const postedAt =
        root.find("time").first().attr("datetime") ??
        firstText(root, ["time", '[class*="date"]']);
      const salary = firstText(root, [
        '[data-testid="salary"]',
        ".salary",
        '[class*="salary"]',
      ]);
      const description = firstText(root, [
        '[data-testid="job-description"]',
        ".job-description",
        '[class*="description"]',
        "p",
      ]);

      jobs.push({
        source: "wazzuf",
        sourceJobId: createSourceJobId(jobUrl),
        title,
        employer,
        jobUrl,
        applicationLink: jobUrl,
        location,
        datePosted: normalizeDate(postedAt),
        salary,
        jobDescription: description,
        jobType: extractJobType(rootText),
        skills: extractSkills($, root),
        isRemote: /\bremote\b/i.test(rootText),
      });
    } catch {
      return;
    }
  });

  return jobs;
}
