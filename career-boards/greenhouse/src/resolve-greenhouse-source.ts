import {
  extractGreenhouseTokenFromHtml,
  GREENHOUSE_BOARDS_API_ORIGIN,
  GREENHOUSE_CANONICAL_BOARD_ORIGIN,
  GREENHOUSE_DEFAULT_USER_AGENT,
  guessTokensFromHostname,
  isGreenhouseHost,
  parseGreenhouseUrl,
} from "./greenhouse-url";

export type GreenhouseResolutionErrorCode =
  | "EMPTY_URL"
  | "INVALID_URL"
  | "NOT_FOUND";

export type GreenhouseResolutionMethod =
  | "greenhouse_url"
  | "page_scrape"
  | "domain_guess";

export interface ResolvedGreenhouseSource {
  token: string;
  canonicalCareersUrl: string;
  companyName: string | null;
  method: GreenhouseResolutionMethod;
}

export interface ResolveGreenhouseSourceOptions {
  url: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  userAgent?: string;
}

export class GreenhouseResolutionError extends Error {
  readonly code: GreenhouseResolutionErrorCode;
  readonly input: string;

  constructor(
    code: GreenhouseResolutionErrorCode,
    message: string,
    input: string,
  ) {
    super(message);
    this.name = "GreenhouseResolutionError";
    this.code = code;
    this.input = input;
  }
}

interface GreenhouseBoardInfo {
  name: string | null;
}

/**
 * Resolves an arbitrary user-supplied URL to a Greenhouse board, trying the
 * cheapest reliable strategy first:
 *
 *  1. The URL already points at Greenhouse    -> parse the token directly.
 *  2. A company careers page                  -> scrape the embedded board token.
 *  3. Scrape blocked/unhelpful                -> guess the token from the domain.
 *
 * Every candidate token is validated against the public board API before being
 * trusted, so a wrong guess never produces a broken source.
 */
export async function resolveGreenhouseSource(
  options: ResolveGreenhouseSourceOptions,
): Promise<ResolvedGreenhouseSource> {
  const input = options.url?.trim() ?? "";
  if (!input) {
    throw new GreenhouseResolutionError(
      "EMPTY_URL",
      "URL cannot be empty.",
      options.url ?? "",
    );
  }

  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error(
      "No fetch implementation available. Pass fetchImpl or use Node 18+.",
    );
  }
  const userAgent = options.userAgent ?? GREENHOUSE_DEFAULT_USER_AGENT;

  // Layer 1: already a Greenhouse URL.
  if (isGreenhouseUrlSafe(input)) {
    const token = parseGreenhouseUrl(input).token;
    const info = await getBoardInfo(token, fetchFn, options.signal, userAgent);
    if (info) return resolved(token, info, "greenhouse_url");
    throw notFound(input);
  }

  const pageUrl = toUrlOrThrow(input);

  // Layer 2: scrape the company careers page for an embedded board token.
  const html = await tryFetchText(
    pageUrl.href,
    fetchFn,
    options.signal,
    userAgent,
  );
  if (html) {
    const scraped = extractGreenhouseTokenFromHtml(html);
    if (scraped) {
      const info = await getBoardInfo(
        scraped,
        fetchFn,
        options.signal,
        userAgent,
      );
      if (info) return resolved(scraped, info, "page_scrape");
    }
  }

  // Layer 3: guess the token from the hostname, validated against the API.
  for (const candidate of guessTokensFromHostname(pageUrl.hostname)) {
    const info = await getBoardInfo(
      candidate,
      fetchFn,
      options.signal,
      userAgent,
    );
    if (info) return resolved(candidate, info, "domain_guess");
  }

  throw notFound(input);
}

async function getBoardInfo(
  token: string,
  fetchFn: typeof fetch,
  signal: AbortSignal | undefined,
  userAgent: string,
): Promise<GreenhouseBoardInfo | null> {
  const url = `${GREENHOUSE_BOARDS_API_ORIGIN}/v1/boards/${token}`;
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "GET",
      signal,
      headers: { accept: "application/json", "user-agent": userAgent },
    });
  } catch {
    return null;
  }
  if (!response.ok) return null;

  try {
    const body = (await response.json()) as { name?: unknown };
    const name =
      typeof body.name === "string" && body.name.trim()
        ? body.name.trim()
        : null;
    return { name };
  } catch {
    return null;
  }
}

async function tryFetchText(
  url: string,
  fetchFn: typeof fetch,
  signal: AbortSignal | undefined,
  userAgent: string,
): Promise<string | null> {
  try {
    const response = await fetchFn(url, {
      method: "GET",
      redirect: "follow",
      signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": userAgent,
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function isGreenhouseUrlSafe(input: string): boolean {
  try {
    return isGreenhouseHost(new URL(input).hostname);
  } catch {
    return false;
  }
}

function toUrlOrThrow(input: string): URL {
  try {
    return new URL(input);
  } catch {
    throw new GreenhouseResolutionError(
      "INVALID_URL",
      `Invalid URL: ${input}`,
      input,
    );
  }
}

function resolved(
  token: string,
  info: GreenhouseBoardInfo,
  method: GreenhouseResolutionMethod,
): ResolvedGreenhouseSource {
  return {
    token,
    canonicalCareersUrl: `${GREENHOUSE_CANONICAL_BOARD_ORIGIN}/${token}`,
    companyName: info.name,
    method,
  };
}

function notFound(input: string): GreenhouseResolutionError {
  return new GreenhouseResolutionError(
    "NOT_FOUND",
    "Could not find a Greenhouse job board for that URL.",
    input,
  );
}
