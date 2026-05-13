const UPWORK_RSS_URL = "https://www.upwork.com/ab/feed/jobs/rss";
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

function toPositiveIntOrFallback(
  value: number | undefined,
  fallback: number,
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value as number));
}

export function buildUpworkRssUrl(
  query: string,
  maxJobsPerTerm?: number,
): string {
  const pageSize = Math.min(
    toPositiveIntOrFallback(maxJobsPerTerm, DEFAULT_PAGE_SIZE),
    MAX_PAGE_SIZE,
  );
  const url = new URL(UPWORK_RSS_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "recency");
  url.searchParams.set("paging", `0;${pageSize}`);
  return url.toString();
}

export async function fetchUpworkRss(args: {
  query: string;
  maxJobsPerTerm?: number;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = buildUpworkRssUrl(args.query, args.maxJobsPerTerm);
  const response = await fetchImpl(url, {
    headers: {
      accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; JobOps/1.0)",
    },
  });

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(
      `Upwork RSS request failed with ${response.status}${statusText} for ${url}`,
    );
  }

  return response.text();
}
