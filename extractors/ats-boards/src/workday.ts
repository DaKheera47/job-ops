import type { CreateJobInput } from "@shared/types/jobs";

// --- Workday URL parsing ---

const LOCALE_SEGMENT_REGEX = /^[a-z]{2}(?:-[a-z]{2})?$/i;
const WORKDAY_PAGE_SIZE = 20;
const MAX_PAGES = 25;
const DISCOVERY_TIMEOUT_MS = 8000;
const DATACENTERS = [1, 3, 5];
const COMMON_BOARDS = ["External", "en-US", "Careers", "Jobs"];

export interface WorkdayConfig {
  subdomain: string;
  companyIdRaw: string;
  companyIdApi: string;
  baseUrl: string;
  cxsUrl: string;
}

export function parseWorkdayUrl(input: string): WorkdayConfig | null {
  let urlStr = input.trim();
  if (!urlStr.includes("://")) urlStr = `https://${urlStr}`;

  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.includes("myworkdayjobs.com")) return null;

  const subdomain = host.split(".")[0];
  if (!subdomain) return null;

  const pathParts = parsed.pathname
    .split("/")
    .filter(Boolean);

  // Skip locale prefix (e.g. en-US)
  let companyIdRaw: string;
  if (pathParts.length > 0 && LOCALE_SEGMENT_REGEX.test(pathParts[0])) {
    companyIdRaw = pathParts[1] ?? subdomain;
  } else {
    companyIdRaw = pathParts[0] ?? subdomain;
  }

  const companyIdApi = companyIdRaw.toLowerCase();
  const origin = parsed.origin;

  return {
    subdomain,
    companyIdRaw,
    companyIdApi,
    baseUrl: `${origin}/${companyIdRaw}`,
    cxsUrl: `${origin}/wday/cxs/${subdomain}/${companyIdApi}/jobs`,
  };
}

// --- Auto-discovery ---

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function parseBoardsFromRobotsTxt(text: string): string[] {
  const boards: string[] = [];
  const seen = new Set<string>();

  for (const line of text.split("\n")) {
    // Allow: /External/
    const allowMatch = line.match(/^Allow:\s*\/([^/\s]+)\//i);
    if (allowMatch) {
      const board = allowMatch[1];
      if (!seen.has(board.toLowerCase())) {
        seen.add(board.toLowerCase());
        boards.push(board);
      }
    }
    // Sitemap: .../External/siteMap.xml
    const sitemapMatch = line.match(/Sitemap:.*?\/([^/]+)\/siteMap\.xml/i);
    if (sitemapMatch) {
      const board = sitemapMatch[1];
      if (!seen.has(board.toLowerCase())) {
        seen.add(board.toLowerCase());
        boards.push(board);
      }
    }
  }

  return boards;
}

async function probeCxs(
  origin: string,
  subdomain: string,
  board: string,
  fetchImpl: typeof fetch,
): Promise<boolean> {
  const url = `${origin}/wday/cxs/${subdomain}/${board.toLowerCase()}/jobs`;
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = await res.json() as { jobPostings?: unknown[] };
    return Array.isArray(data.jobPostings);
  } catch {
    return false;
  }
}

export async function discoverWorkdayUrl(
  companyName: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const subdomain = normalizeCompanyName(companyName);
  if (!subdomain) return null;

  for (const dc of DATACENTERS) {
    const origin = `https://${subdomain}.wd${dc}.myworkdayjobs.com`;

    // Try robots.txt first
    let boards: string[] = [];
    try {
      const res = await fetchImpl(`${origin}/robots.txt`, {
        signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
      });
      if (res.status === 200) {
        const text = await res.text();
        boards = parseBoardsFromRobotsTxt(text);
      } else if (res.status === 406) {
        // Correct datacenter but no robots.txt — try common boards
        boards = [...COMMON_BOARDS, subdomain];
      } else {
        // 422 or other — wrong datacenter
        continue;
      }
    } catch {
      // DNS error or timeout — skip
      continue;
    }

    // Probe each candidate board
    for (const board of boards) {
      const found = await probeCxs(origin, subdomain, board, fetchImpl);
      if (found) {
        return `${subdomain}.wd${dc}.myworkdayjobs.com/${board}`;
      }
    }
  }

  return null;
}

// --- Job fetching ---

interface WorkdayPosting {
  title?: string;
  externalPath?: string;
  postedOn?: string;
  locationsText?: string;
  bulletFields?: string[];
}

function inferLocationFromPath(externalPath: string): string {
  // URL structure: /job/{location}/{title}/{reqId}
  const parts = externalPath.split("/").filter(Boolean);
  const jobIdx = parts.indexOf("job");
  if (jobIdx >= 0 && parts[jobIdx + 1]) {
    return decodeURIComponent(parts[jobIdx + 1]).replace(/-/g, " ");
  }
  return "Not specified";
}

export async function fetchWorkdayJobs(
  slug: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CreateJobInput[]> {
  const config = parseWorkdayUrl(slug);
  if (!config) {
    throw new Error(`Invalid Workday URL: "${slug}"`);
  }

  const allJobs: CreateJobInput[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetchImpl(config.cxsUrl, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        appliedFacets: {},
        limit: WORKDAY_PAGE_SIZE,
        offset,
        searchText: "",
      }),
    });

    if (!res.ok) {
      throw new Error(`Workday CXS for "${slug}" returned ${res.status}`);
    }

    const data = await res.json() as { jobPostings?: WorkdayPosting[] };
    const postings = data.jobPostings ?? [];

    if (postings.length === 0) break;

    for (const p of postings) {
      if (!p.title || !p.externalPath) continue;

      const jobUrl = p.externalPath.startsWith("http")
        ? p.externalPath
        : `${config.baseUrl}${p.externalPath.startsWith("/") ? "" : "/"}${p.externalPath}`;

      const location = p.locationsText
        ?? inferLocationFromPath(p.externalPath);

      allJobs.push({
        source: "workday",
        title: p.title,
        employer: config.subdomain,
        jobUrl,
        applicationLink: jobUrl,
        location,
        datePosted: p.postedOn ?? undefined,
      });
    }

    if (postings.length < WORKDAY_PAGE_SIZE) break;
    offset += WORKDAY_PAGE_SIZE;
  }

  return allJobs;
}
