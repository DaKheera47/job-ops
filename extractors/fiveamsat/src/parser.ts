import { Buffer } from "node:buffer";
import type { Cheerio, CheerioAPI } from "cheerio";
import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { CreateJobInput } from "job-ops-shared/types/jobs";

const KHAMSAT_ORIGIN = "https://khamsat.com";

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function firstText(
  root: Cheerio<AnyNode>,
  selectors: string[],
): string | undefined {
  for (const selector of selectors) {
    const text = normalizeWhitespace(root.find(selector).first().text());
    if (text) return text;
  }

  return undefined;
}

function normalizeUrl(href: string): string {
  return new URL(href, KHAMSAT_ORIGIN).toString();
}

function createSourceJobId(url: string): string {
  const pathId = /\/services?\/([^?#]+)/i.exec(new URL(url).pathname)?.[1];
  return pathId
    ? decodeURIComponent(pathId).replace(/\/+/g, "-").slice(0, 80)
    : Buffer.from(url).toString("base64url").slice(0, 16);
}

function extractPrice(text: string): string | undefined {
  const match =
    /(?:\$\s?\d[\d,.]*|\d[\d,.]*\s*(?:دولار|جنيه|ر\.س|ريال|USD))/i.exec(text);
  return match?.[0]?.trim();
}

function titleAnchorFor(
  $: CheerioAPI,
  card: Cheerio<AnyNode>,
): Cheerio<AnyNode> {
  const anchors = card
    .find('a[href*="/service"], a[href*="/services"]')
    .filter((_, element) => {
      const href = $(element).attr("href") ?? "";
      const text = normalizeWhitespace($(element).text());
      return text.length > 0 && !href.includes("/user/");
    });
  return anchors.first();
}

export function parseFiveamsatServices(html: string): CreateJobInput[] {
  const $ = cheerio.load(html);
  const jobs: CreateJobInput[] = [];
  const seen = new Set<string>();
  const anchors = $('a[href*="/service"], a[href*="/services"]').filter(
    (_, element) => {
      const href = $(element).attr("href") ?? "";
      return (
        !href.includes("/user/") &&
        normalizeWhitespace($(element).text()).length > 0
      );
    },
  );

  anchors.each((_, anchor) => {
    try {
      const card = $(anchor).closest(
        '[data-service-id], article, li, .service-card, .service, .card, div[class*="service"]',
      );
      const root = card.length > 0 ? card : $(anchor).parent();
      const titleAnchor = titleAnchorFor($, root);
      const href = titleAnchor.attr("href") ?? $(anchor).attr("href");
      const title = normalizeWhitespace(titleAnchor.text() || $(anchor).text());
      if (!href || !title) return;

      const jobUrl = normalizeUrl(href);
      if (seen.has(jobUrl)) return;
      seen.add(jobUrl);

      const rootText = normalizeWhitespace(root.text());
      const seller =
        firstText(root, [
          '[class*="seller"]',
          '[class*="username"]',
          '[class*="user-name"]',
          ".user",
          ".author",
          'a[href*="/user/"]',
        ]) ?? "Khamsat Seller";
      const description = firstText(root, [
        '[class*="description"]',
        '[class*="summary"]',
        "p",
      ]);
      const salary =
        firstText(root, [
          '[class*="price"]',
          '[class*="amount"]',
          ".price",
          ".money",
        ]) ?? extractPrice(rootText);

      jobs.push({
        source: "fiveamsat",
        sourceJobId: createSourceJobId(jobUrl),
        title,
        employer: seller,
        jobUrl,
        applicationLink: jobUrl,
        salary,
        jobDescription: description,
        jobType: "Freelance / Project",
      });
    } catch {
      return;
    }
  });

  return jobs;
}
