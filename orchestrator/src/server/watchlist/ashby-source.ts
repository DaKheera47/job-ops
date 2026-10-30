import { ASHBY_JOB_ID, ASHBY_JOBS_ORIGIN, parseAshbyUrl } from "@shared/ashby";
import { JSDOM } from "jsdom";
import { parsePublicAshbyPageUrl, readPublicAshbyUrl } from "./ashby-http";

function getPageData(html: string, pageUrl: string) {
  const page = JSDOM.fragment(html);
  const links = Array.from(page.querySelectorAll("a[href]")).flatMap((a) => {
    try {
      return [new URL(a.getAttribute("href") ?? "", pageUrl).href];
    } catch {
      return [];
    }
  });
  return {
    links,
    scripts: Array.from(
      page.querySelectorAll("script"),
      (script) => script.textContent ?? "",
    ),
  };
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
  const options = {
    signal,
    maxBytes: 5 * 1024 * 1024,
    accept: "text/html,application/xhtml+xml",
  };
  const first = await readPublicAshbyUrl(page.href, options);
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
      const child = await readPublicAshbyUrl(href, options);
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
    try {
      const chunks: unknown = JSON.parse(match[1]);
      if (!Array.isArray(chunks) || typeof chunks[1] !== "string") continue;
      for (const line of chunks[1].split("\n")) {
        try {
          JSON.parse(line.slice(line.indexOf(":") + 1), (_key, item) => {
            if (
              typeof item?.urlSlug === "string" &&
              /^[a-z0-9][a-z0-9-]{0,249}$/.test(item.urlSlug) &&
              ASHBY_JOB_ID.test(item.id) &&
              item.jobUrl === `https://jobs.ashbyhq.com/cursor/${item.id}`
            ) {
              const url = `https://cursor.com/careers/${item.urlSlug}`;
              if (actualLinks.has(url)) result.set(item.id, url);
            }
            return item;
          });
        } catch {
          /* Ignore RSC text records; only JSON models contain job data. */
        }
      }
    } catch {
      /* Ignore unrelated script payloads. */
    }
  }
  return result;
}
