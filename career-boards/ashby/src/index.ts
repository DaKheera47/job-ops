import { JSDOM, VirtualConsole } from "jsdom";
import { z } from "zod";
import {
  ASHBY_API_ORIGIN,
  ASHBY_JOB_ID,
  ASHBY_JOBS_ORIGIN,
  parseAshbyUrl,
} from "./ashby-url";
import { parsePublicAshbyPageUrl, readPublicAshbyUrl } from "./public-http";

export { ashbyBoardLabel, parseAshbyUrl } from "./ashby-url";

const addressSchema = z.object({
  addressLocality: z.string().max(2000).nullish(),
  addressRegion: z.string().max(2000).nullish(),
  addressCountry: z.string().max(2000).nullish(),
});
const locationSchema = z.object({
  location: z.string().max(2000).nullish(),
  address: addressSchema.nullish(),
});
const jobSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(1000),
  isListed: z.boolean(),
  jobUrl: z.string().url().max(3000),
  applyUrl: z.string().url().max(3000),
  descriptionHtml: z.string().max(1024 * 1024),
  descriptionPlain: z.string().max(1024 * 1024),
  location: z.string().max(2000).nullish(),
  address: z.object({ postalAddress: addressSchema.nullish() }).nullish(),
  secondaryLocations: z.array(locationSchema).max(1000).nullish(),
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
export type AshbyJob = z.infer<typeof jobSchema>;
export type AshbyBoard = { board: string; jobs: AshbyJob[] };
const boardSchema = z.object({
  apiVersion: z.literal("1"),
  jobs: z.array(jobSchema),
});

export async function getAshbyBoard(
  careersUrl: string,
  signal?: AbortSignal,
): Promise<AshbyBoard> {
  const { board } = parseAshbyUrl(careersUrl);
  const response = await readPublicAshbyUrl(
    `${ASHBY_API_ORIGIN}/posting-api/job-board/${board}?includeCompensation=true`,
    {
      signal,
      maxBytes: 25 * 1024 * 1024,
      accept: "application/json",
    },
  );
  let parsed: z.infer<typeof boardSchema>;
  try {
    parsed = boardSchema.parse(JSON.parse(response.text));
  } catch {
    throw new Error("Ashby returned an invalid or unsupported job feed.");
  }
  const seen = new Set<string>();
  const jobs = parsed.jobs.filter((job) => job.isListed);
  for (const job of jobs) {
    const expected = `${ASHBY_JOBS_ORIGIN}/${board}/${job.id}`;
    if (
      seen.has(job.id) ||
      !matchesJobUrl(job.jobUrl, board, job.id, false) ||
      !matchesJobUrl(job.applyUrl, board, job.id, true)
    ) {
      throw new Error(
        "Ashby returned duplicate or inconsistent posting identities.",
      );
    }
    seen.add(job.id);
    job.jobUrl = expected;
    job.applyUrl = `${expected}/application`;
  }
  return { board, jobs };
}

function matchesJobUrl(
  input: string,
  board: string,
  id: string,
  application: boolean,
): boolean {
  try {
    const url = new URL(input);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname === "jobs.ashbyhq.com" &&
      url.pathname.toLowerCase() ===
        `/${board}/${id}${application ? "/application" : ""}`
    );
  } catch {
    return false;
  }
}

function getPageData(html: string, pageUrl: string) {
  const dom = new JSDOM(html, {
    url: pageUrl,
    virtualConsole: new VirtualConsole(),
  });
  try {
    const links = Array.from(
      dom.window.document.querySelectorAll("a[href]"),
      (a) => (a as HTMLAnchorElement).href,
    );
    const scripts = Array.from(
      dom.window.document.querySelectorAll("script"),
      (script) => script.textContent ?? "",
    );
    return { links, scripts };
  } finally {
    dom.window.close();
  }
}

function boardsInHtml(html: string): string[] {
  const text = html.replace(/\\\//g, "/").replace(/\\u002f/gi, "/");
  const urls =
    text.match(
      /https:\/\/(?:jobs\.ashbyhq\.com\/|api\.ashbyhq\.com\/posting-api\/job-board\/)[a-z0-9_-]+(?:\/[^\s<>"'\\]*)?/gi,
    ) ?? [];
  const boards = new Set<string>();
  for (const url of urls) {
    try {
      boards.add(parseAshbyUrl(url).board);
    } catch {
      /* Ignore non-board links such as talent community forms. */
    }
  }
  return [...boards];
}

export async function resolveAshbySource(
  input: string,
  signal?: AbortSignal,
): Promise<{ board: string; careersUrl: string }> {
  try {
    return parseAshbyUrl(input);
  } catch {
    /* Company pages need bounded discovery below. */
  }
  const page = parsePublicAshbyPageUrl(input);
  if (["jobs.ashbyhq.com", "api.ashbyhq.com"].includes(page.hostname)) {
    throw new Error(
      "Use an Ashby board or posting URL, not a talent form or API path.",
    );
  }
  const first = await readPublicAshbyUrl(page.href, {
    signal,
    maxBytes: 5 * 1024 * 1024,
    accept: "text/html,application/xhtml+xml",
  });
  let boards = boardsInHtml(first.text);
  if (!boards.length) {
    const origin = new URL(first.url).origin;
    const children = [...new Set(getPageData(first.text, first.url).links)]
      .filter((href) => {
        const url = new URL(href);
        return (
          url.origin === origin &&
          /\/(?:careers|jobs|positions)\/.+/.test(url.pathname) &&
          url.href !== first.url
        );
      })
      .slice(0, 2);
    for (const href of children) {
      const child = await readPublicAshbyUrl(href, {
        signal,
        maxBytes: 5 * 1024 * 1024,
        accept: "text/html,application/xhtml+xml",
      });
      boards.push(...boardsInHtml(child.text));
    }
  }
  boards = [...new Set(boards)];
  if (boards.length !== 1) {
    throw new Error(
      boards.length
        ? "This page references multiple Ashby boards. Paste the board you want to watch."
        : "No public Ashby board was found. Paste the jobs.ashbyhq.com board URL instead.",
    );
  }
  return parseAshbyUrl(`${ASHBY_JOBS_ORIGIN}/${boards[0]}`);
}

export async function getCursorJobLinks(
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const page = await readPublicAshbyUrl("https://cursor.com/careers", {
    signal,
    maxBytes: 5 * 1024 * 1024,
    accept: "text/html,application/xhtml+xml",
  });
  if (new URL(page.url).origin !== "https://cursor.com")
    throw new Error("Cursor careers moved to an unverified destination.");
  const { scripts, links } = getPageData(page.text, page.url);
  const actualLinks = new Set(links);
  const result = new Map<string, string>();
  for (const script of scripts) {
    const match = /^self\.__next_f\.push\((\[.*\])\);?$/s.exec(script);
    if (!match) continue;
    let chunks: unknown;
    try {
      chunks = JSON.parse(match[1]);
    } catch {
      continue;
    }
    if (!Array.isArray(chunks)) continue;
    for (const chunk of chunks) {
      if (typeof chunk !== "string") continue;
      for (const line of chunk.split("\n")) {
        let value: unknown;
        try {
          value = JSON.parse(line.slice(line.indexOf(":") + 1));
        } catch {
          continue;
        }
        const stack = [value];
        while (stack.length) {
          const record = stack.pop();
          if (!record || typeof record !== "object") continue;
          if (Array.isArray(record)) {
            stack.push(...record);
            continue;
          }
          const item = record as Record<string, unknown>;
          if (
            typeof item.id === "string" &&
            ASHBY_JOB_ID.test(item.id) &&
            typeof item.urlSlug === "string" &&
            /^[a-z0-9][a-z0-9-]{0,249}$/.test(item.urlSlug) &&
            typeof item.jobUrl === "string" &&
            matchesJobUrl(item.jobUrl, "cursor", item.id, false)
          ) {
            const url = `https://cursor.com/careers/${item.urlSlug}`;
            if (actualLinks.has(url)) result.set(item.id, url);
          }
          stack.push(...Object.values(item));
        }
      }
    }
  }
  return result;
}

export function ashbyLocation(job: AshbyJob): string | null {
  const locations = [
    ...new Set(
      [
        formatLocation(job.location, job.address?.postalAddress),
        ...(job.secondaryLocations ?? []).map((item) =>
          formatLocation(item.location, item.address),
        ),
      ].filter((value): value is string => Boolean(value?.trim())),
    ),
  ];
  const workplace = ["Remote", "Hybrid", "OnSite"].includes(
    job.workplaceType ?? "",
  )
    ? job.workplaceType === "OnSite"
      ? "On-site"
      : job.workplaceType
    : null;
  return [workplace, ...locations].filter(Boolean).join("; ") || null;
}

function formatLocation(
  label: string | null | undefined,
  address: z.infer<typeof addressSchema> | null | undefined,
): string {
  const country = address?.addressCountry?.trim();
  const parts = label?.trim()
    ? [label.trim()]
    : [address?.addressLocality, address?.addressRegion].filter(Boolean);
  if (
    country &&
    !parts.some((part) =>
      part
        ?.split(/[,;]/)
        .some((value) => value.trim().toLowerCase() === country.toLowerCase()),
    )
  )
    parts.push(country);
  return parts.join(", ");
}
