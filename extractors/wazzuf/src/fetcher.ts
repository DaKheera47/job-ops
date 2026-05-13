const WUZZUF_SEARCH_URL = "https://wuzzuf.net/search/jobs/";

export function buildWazzufSearchUrl(query: string): string {
  const url = new URL(WUZZUF_SEARCH_URL);
  url.searchParams.set("q", query);
  return url.toString();
}

export async function fetchWazzufSearchPage(args: {
  query: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = buildWazzufSearchUrl(args.query);
  const response = await fetchImpl(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en,ar;q=0.9",
      "user-agent": "Mozilla/5.0 (compatible; JobOps/1.0)",
    },
  });

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(
      `WUZZUF search request failed with ${response.status}${statusText} for ${url}`,
    );
  }

  return response.text();
}
