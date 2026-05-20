export type BamboohrUrlParseErrorCode =
  | "EMPTY_URL"
  | "INVALID_URL"
  | "UNSUPPORTED_HOST"
  | "MISSING_CAREERS_PATH"
  | "INVALID_JOB_ID";

export interface BamboohrSourceConfig {
  inputUrl: string;
  origin: string;
  host: string;
  companySlug: string;
  canonicalCareersUrl: string;
  listUrl: string;
  companyInfoUrl: string;
}

export interface BamboohrJobSourceConfig extends BamboohrSourceConfig {
  jobId: string;
  canonicalJobUrl: string;
  detailUrl: string;
}

export class BamboohrUrlParseError extends Error {
  readonly code: BamboohrUrlParseErrorCode;
  readonly input: string;

  constructor(code: BamboohrUrlParseErrorCode, message: string, input: string) {
    super(message);
    this.name = "BamboohrUrlParseError";
    this.code = code;
    this.input = input;
  }
}

export function isBamboohrUrl(input: string): boolean {
  try {
    parseBamboohrUrl(input);
    return true;
  } catch {
    return false;
  }
}

export function parseBamboohrUrl(input: string): BamboohrSourceConfig {
  if (!input.trim()) {
    throw new BamboohrUrlParseError("EMPTY_URL", "URL cannot be empty.", input);
  }

  const url = toUrl(input);
  const host = url.hostname.toLowerCase();
  if (!host.endsWith(".bamboohr.com")) {
    throw new BamboohrUrlParseError(
      "UNSUPPORTED_HOST",
      `Unsupported BambooHR host: ${host}`,
      input,
    );
  }

  const companySlug = host.slice(0, -".bamboohr.com".length);
  if (!companySlug) {
    throw new BamboohrUrlParseError(
      "UNSUPPORTED_HOST",
      `Unsupported BambooHR host: ${host}`,
      input,
    );
  }

  const segments = getPathSegments(url.pathname);
  if (segments[0]?.toLowerCase() !== "careers") {
    throw new BamboohrUrlParseError(
      "MISSING_CAREERS_PATH",
      "BambooHR URLs must start with /careers.",
      input,
    );
  }

  const canonicalCareersUrl = `${url.origin}/careers`;

  return {
    inputUrl: input,
    origin: url.origin,
    host,
    companySlug,
    canonicalCareersUrl,
    listUrl: `${canonicalCareersUrl}/list`,
    companyInfoUrl: `${canonicalCareersUrl}/company-info`,
  };
}

export function parseBamboohrJobUrl(input: string): BamboohrJobSourceConfig {
  const source = parseBamboohrUrl(input);
  const url = toUrl(input);
  const segments = getPathSegments(url.pathname);
  const maybeJobId = segments[1];

  if (!maybeJobId || !/^\d+$/.test(maybeJobId)) {
    throw new BamboohrUrlParseError(
      "INVALID_JOB_ID",
      "BambooHR job URLs must include a numeric job id under /careers/{id}.",
      input,
    );
  }

  return buildBamboohrJobSource(source, maybeJobId);
}

export function bamboohrUrlToCompanyLabel(input: string): string {
  const parsed = parseBamboohrUrl(input);
  return formatCompanySlug(parsed.companySlug);
}

export function bamboohrUrlToSourceKey(input: string): string {
  const parsed = parseBamboohrUrl(input);
  return `bamboohr:${toSourceKeyPart(parsed.companySlug)}`;
}

export function bamboohrUrlToJobDetailsUrl(
  input: string,
  jobId: string,
): string {
  return buildBamboohrJobSource(parseBamboohrUrl(input), jobId).detailUrl;
}

export function bamboohrUrlToJobUrl(input: string, jobId: string): string {
  return buildBamboohrJobSource(parseBamboohrUrl(input), jobId).canonicalJobUrl;
}

function buildBamboohrJobSource(
  source: BamboohrSourceConfig,
  jobId: string,
): BamboohrJobSourceConfig {
  if (!/^\d+$/.test(jobId)) {
    throw new BamboohrUrlParseError(
      "INVALID_JOB_ID",
      `Invalid BambooHR job id: ${jobId}`,
      source.inputUrl,
    );
  }

  return {
    ...source,
    jobId,
    canonicalJobUrl: `${source.canonicalCareersUrl}/${jobId}`,
    detailUrl: `${source.canonicalCareersUrl}/${jobId}/detail`,
  };
}

function toUrl(input: string): URL {
  try {
    return new URL(input.trim());
  } catch {
    throw new BamboohrUrlParseError(
      "INVALID_URL",
      `Invalid URL: ${input}`,
      input,
    );
  }
}

function getPathSegments(pathname: string): string[] {
  return pathname.split("/").filter(Boolean);
}

function formatCompanySlug(slug: string): string {
  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toSourceKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}
