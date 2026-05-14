const KHAMSAT_ORIGIN = "https://khamsat.com";

export function buildFiveamsatSearchUrl(query: string): string {
  const normalizedQuery = query.trim().replace(/\s+/g, "-");
  return `${KHAMSAT_ORIGIN}/services/${encodeURIComponent(normalizedQuery)}`;
}

export async function fetchFiveamsatSearchPage(args: {
  query: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const url = buildFiveamsatSearchUrl(args.query);
  const response = await fetchImpl(url, {
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ar,en;q=0.9",
      "user-agent": "Mozilla/5.0 (compatible; JobOps/1.0)",
    },
  });

  if (!response.ok) {
    const statusText = response.statusText ? ` ${response.statusText}` : "";
    throw new Error(
      `Khamsat search request failed with ${response.status}${statusText} for ${url}`,
    );
  }

  return response.text();
}
