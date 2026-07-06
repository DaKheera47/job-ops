export type GreenhouseUrlParseErrorCode =
  | "EMPTY_URL"
  | "INVALID_URL"
  | "UNSUPPORTED_HOST"
  | "MISSING_BOARD_TOKEN";

export const GREENHOUSE_BOARDS_API_ORIGIN = "https://boards-api.greenhouse.io";
export const GREENHOUSE_CANONICAL_BOARD_ORIGIN =
  "https://job-boards.greenhouse.io";

export const GREENHOUSE_DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

// Greenhouse board tokens are lowercase alphanumeric slugs, occasionally with
// hyphens/underscores. Path segments like "embed"/"v1"/"boards" are structural
// and must never be treated as a token.
const TOKEN_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const RESERVED_SEGMENTS = new Set([
  "embed",
  "v1",
  "boards",
  "jobs",
  "job_board",
  "job_app",
  "js",
]);

export interface GreenhouseSourceConfig {
  inputUrl: string;
  token: string;
  canonicalCareersUrl: string;
  boardApiUrl: string;
  boardJobsUrl: string;
}

export class GreenhouseUrlParseError extends Error {
  readonly code: GreenhouseUrlParseErrorCode;
  readonly input: string;

  constructor(
    code: GreenhouseUrlParseErrorCode,
    message: string,
    input: string,
  ) {
    super(message);
    this.name = "GreenhouseUrlParseError";
    this.code = code;
    this.input = input;
  }
}

export function isGreenhouseUrl(input: string): boolean {
  try {
    parseGreenhouseUrl(input);
    return true;
  } catch {
    return false;
  }
}

export function isGreenhouseHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "greenhouse.io" || host.endsWith(".greenhouse.io");
}

export function parseGreenhouseUrl(input: string): GreenhouseSourceConfig {
  if (!input.trim()) {
    throw new GreenhouseUrlParseError(
      "EMPTY_URL",
      "URL cannot be empty.",
      input,
    );
  }

  const url = toUrl(input);
  const host = url.hostname.toLowerCase();
  if (!isGreenhouseHost(host)) {
    throw new GreenhouseUrlParseError(
      "UNSUPPORTED_HOST",
      `Unsupported Greenhouse host: ${host}`,
      input,
    );
  }

  const token = extractBoardTokenFromUrl(url, host);
  if (!token) {
    throw new GreenhouseUrlParseError(
      "MISSING_BOARD_TOKEN",
      "Could not determine a Greenhouse board token from the URL.",
      input,
    );
  }

  return buildSourceConfig(input, token);
}

export function buildGreenhouseSourceConfig(
  token: string,
  inputUrl = "",
): GreenhouseSourceConfig {
  const normalized = normalizeToken(token);
  if (!normalized) {
    throw new GreenhouseUrlParseError(
      "MISSING_BOARD_TOKEN",
      `Invalid Greenhouse board token: ${token}`,
      inputUrl || token,
    );
  }
  return buildSourceConfig(inputUrl, normalized);
}

export function greenhouseTokenToLabel(token: string): string {
  return token
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function greenhouseUrlToSourceKey(input: string): string {
  return `greenhouse:${parseGreenhouseUrl(input).token}`;
}

export function greenhouseTokenToSourceKey(token: string): string {
  return `greenhouse:${normalizeToken(token) ?? token}`;
}

export function greenhouseJobApiUrl(token: string, jobId: string): string {
  return `${GREENHOUSE_BOARDS_API_ORIGIN}/v1/boards/${token}/jobs/${jobId}`;
}

export interface GreenhouseJobApiRef {
  token: string;
  jobId: string;
}

export function parseGreenhouseJobApiUrl(input: string): GreenhouseJobApiRef {
  const url = toUrl(input);
  const segments = getPathSegments(url.pathname);
  const boardsIdx = segments.indexOf("boards");
  const token =
    boardsIdx >= 0 ? normalizeToken(segments[boardsIdx + 1]) : undefined;
  const jobsIdx = segments.indexOf("jobs");
  const jobId = jobsIdx >= 0 ? segments[jobsIdx + 1] : undefined;

  if (!token || !jobId || !/^\d+$/.test(jobId)) {
    throw new GreenhouseUrlParseError(
      "INVALID_URL",
      `Not a Greenhouse job API URL: ${input}`,
      input,
    );
  }
  return { token, jobId };
}

/**
 * Best-effort extraction of a Greenhouse board token from arbitrary page
 * markup (HTML/JS). Recruiter pages embed the board via a script tag such as
 * `.../job_board/js?for=riotgames`, an iframe to `boards.greenhouse.io/<token>`,
 * or direct calls to the board API. Returns the first plausible token found.
 */
export function extractGreenhouseTokenFromHtml(html: string): string | null {
  const patterns = [
    /job_board\/js\?[^"'<>]*\bfor=([a-z0-9_-]+)/i,
    /job_(?:board|app)\?[^"'<>]*\bfor=([a-z0-9_-]+)/i,
    /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i,
    /(?:job-)?boards\.greenhouse\.io\/(?:embed\/[a-z_]+\?[^"'<>]*\bfor=)?([a-z0-9_-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    const token = normalizeToken(match?.[1]);
    if (token && !RESERVED_SEGMENTS.has(token)) {
      return token;
    }
  }
  return null;
}

/**
 * Ordered list of candidate board tokens derived from a company hostname, most
 * likely first. Greenhouse tokens are frequently the bare second-level domain
 * (epicgames.com -> "epicgames"). Callers must validate each candidate against
 * the board API before trusting it.
 */
export function guessTokensFromHostname(hostname: string): string[] {
  const labels = hostname
    .toLowerCase()
    .split(".")
    .filter((label) => label && label !== "www");
  if (labels.length === 0) return [];

  // Drop the public-suffix tail (e.g. ".com", ".co.uk").
  const suffixSecondLevel = new Set([
    "co",
    "com",
    "org",
    "net",
    "gov",
    "edu",
    "ac",
  ]);
  const meaningful = [...labels];
  meaningful.pop(); // TLD label (com, io, uk, ...)
  if (
    meaningful.length > 1 &&
    suffixSecondLevel.has(meaningful[meaningful.length - 1] ?? "")
  ) {
    meaningful.pop(); // second-level public suffix (co.uk -> drop "co")
  }

  const candidates = [
    meaningful[meaningful.length - 1], // registrable label
    meaningful.join(""), // subdomain-joined fallback
    labels.join(""), // whole host joined, last resort
  ];

  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of candidates) {
    const token = normalizeToken(candidate);
    if (token && !seen.has(token)) {
      seen.add(token);
      result.push(token);
    }
  }
  return result;
}

function buildSourceConfig(
  inputUrl: string,
  token: string,
): GreenhouseSourceConfig {
  const boardApiUrl = `${GREENHOUSE_BOARDS_API_ORIGIN}/v1/boards/${token}`;
  return {
    inputUrl,
    token,
    canonicalCareersUrl: `${GREENHOUSE_CANONICAL_BOARD_ORIGIN}/${token}`,
    boardApiUrl,
    boardJobsUrl: `${boardApiUrl}/jobs`,
  };
}

function extractBoardTokenFromUrl(url: URL, host: string): string | undefined {
  const segments = getPathSegments(url.pathname);
  const forParam = normalizeToken(url.searchParams.get("for"));

  if (host === "boards-api.greenhouse.io") {
    const boardsIdx = segments.indexOf("boards");
    if (boardsIdx >= 0) return normalizeToken(segments[boardsIdx + 1]);
    return undefined;
  }

  // boards.greenhouse.io, job-boards.greenhouse.io, boards.eu.greenhouse.io, ...
  const first = segments[0]?.toLowerCase();
  if (first && !RESERVED_SEGMENTS.has(first)) {
    return normalizeToken(first);
  }
  // Embedded board/app URLs carry the token in the `for` query parameter.
  return forParam;
}

function normalizeToken(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return normalized && TOKEN_PATTERN.test(normalized) ? normalized : undefined;
}

function toUrl(input: string): URL {
  try {
    return new URL(input.trim());
  } catch {
    throw new GreenhouseUrlParseError(
      "INVALID_URL",
      `Invalid URL: ${input}`,
      input,
    );
  }
}

function getPathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}
