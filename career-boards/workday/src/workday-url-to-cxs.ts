// packages/sources/workday/src/workday-url-to-cxs.ts

export type WorkdayUrlKind =
  | "legacy-myworkdayjobs"
  | "myworkdaysite-recruiting"
  | "cxs-jobs-endpoint";

export type WorkdayUrlParseErrorCode =
  | "EMPTY_URL"
  | "INVALID_URL"
  | "UNSUPPORTED_HOST"
  | "MISSING_SITE"
  | "MISSING_RECRUITING_PARTS"
  | "MISSING_CXS_PARTS";

export interface WorkdaySourceConfig {
  inputUrl: string;
  kind: WorkdayUrlKind;
  origin: string;
  host: string;
  tenant: string;
  site: string;
  shard?: string;
  locale?: string;
  cxsJobsUrl: string;
  canonicalCareersUrl: string;
}

export interface WorkdayJobSourceConfig extends WorkdaySourceConfig {
  externalPath: string;
  cxsJobUrl: string;
  canonicalJobUrl: string;
}

export class WorkdayUrlParseError extends Error {
  readonly code: WorkdayUrlParseErrorCode;
  readonly input: string;

  constructor(code: WorkdayUrlParseErrorCode, message: string, input: string) {
    super(message);
    this.name = "WorkdayUrlParseError";
    this.code = code;
    this.input = input;
  }
}

/**
 * Returns true for Workday career URLs this parser knows how to handle.
 * This includes legacy myworkdayjobs.com URLs and newer myworkdaysite.com recruiting URLs.
 */
export function isWorkdayUrl(input: string): boolean {
  try {
    parseWorkdayUrl(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convenience helper for callers that only need the CXS jobs endpoint.
 */
export function workdayUrlToCxsJobsUrl(input: string): string {
  return parseWorkdayUrl(input).cxsJobsUrl;
}

/**
 * Best-effort display label for Workday career URLs.
 * Prefers a non-generic site slug and otherwise falls back to the tenant slug.
 */
export function workdayUrlToCompanyLabel(input: string): string {
  const source = parseWorkdayUrl(input);
  const preferredSlug = choosePreferredCompanySlug(source);
  return formatCompanySlug(preferredSlug);
}

/**
 * Convenience helper for callers that need the CXS job detail endpoint.
 */
export function workdayJobUrlToCxsJobUrl(input: string): string {
  return parseWorkdayJobUrl(input).cxsJobUrl;
}

/**
 * Converts a public Workday job URL into the JSON job detail endpoint used by
 * Workday Candidate Experience.
 */
export function parseWorkdayJobUrl(input: string): WorkdayJobSourceConfig {
  const cxsJobResult = parseExistingCxsJobEndpoint(input);
  if (cxsJobResult) return cxsJobResult;

  const source = parseWorkdayUrl(input);
  const url = toUrl(input);
  const segments = getPathSegments(url.pathname);
  const externalPath = getJobExternalPath(input, source, segments);

  return {
    ...source,
    externalPath,
    cxsJobUrl: buildCxsJobUrl(
      source.origin,
      source.tenant,
      source.site,
      externalPath,
    ),
    canonicalJobUrl: `${source.canonicalCareersUrl}${externalPath}`,
  };
}

/**
 * Converts public Workday careers URLs into the JSON jobs endpoint used by Workday Candidate Experience.
 *
 * Examples:
 *
 * https://autodesk.wd1.myworkdayjobs.com/Ext
 * -> https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs
 *
 * https://autodesk.wd1.myworkdayjobs.com/en-US/Ext
 * -> https://autodesk.wd1.myworkdayjobs.com/wday/cxs/autodesk/Ext/jobs
 *
 * https://wd5.myworkdaysite.com/recruiting/workday/Workday
 * -> https://wd5.myworkdaysite.com/wday/cxs/workday/Workday/jobs
 */
export function parseWorkdayUrl(input: string): WorkdaySourceConfig {
  const url = toUrl(input);
  const host = url.hostname.toLowerCase();
  const origin = url.origin;
  const segments = getPathSegments(url.pathname);

  const cxsResult = parseExistingCxsEndpoint(
    input,
    url,
    host,
    origin,
    segments,
  );
  if (cxsResult) return cxsResult;

  const legacyMatch = host.match(
    /^(?<tenant>[a-z0-9-]+)\.(?<shard>wd\d+)\.myworkdayjobs\.com$/i,
  );

  if (legacyMatch?.groups) {
    return parseLegacyMyworkdayjobsUrl({
      input,
      origin,
      host,
      tenant: legacyMatch.groups.tenant,
      shard: legacyMatch.groups.shard,
      segments,
    });
  }

  const myworkdaysiteMatch = host.match(
    /^(?<shard>wd\d+)\.myworkdaysite\.com$/i,
  );

  if (myworkdaysiteMatch?.groups) {
    return parseMyworkdaysiteRecruitingUrl({
      input,
      origin,
      host,
      shard: myworkdaysiteMatch.groups.shard,
      segments,
    });
  }

  throw new WorkdayUrlParseError(
    "UNSUPPORTED_HOST",
    `Unsupported Workday host: ${host}`,
    input,
  );
}

function parseExistingCxsEndpoint(
  input: string,
  _url: URL,
  host: string,
  origin: string,
  segments: string[],
): WorkdaySourceConfig | null {
  const wdayIndex = segments.findIndex(
    (segment) => segment.toLowerCase() === "wday",
  );

  if (wdayIndex === -1) return null;

  const maybeCxs = segments[wdayIndex + 1]?.toLowerCase();
  const tenant = segments[wdayIndex + 2];
  const site = segments[wdayIndex + 3];
  const maybeJobs = segments[wdayIndex + 4]?.toLowerCase();

  if (maybeCxs !== "cxs") return null;

  if (!tenant || !site || maybeJobs !== "jobs") {
    throw new WorkdayUrlParseError(
      "MISSING_CXS_PARTS",
      "Workday CXS URL must look like /wday/cxs/{tenant}/{site}/jobs.",
      input,
    );
  }

  const shard = extractShard(host);
  const kind = host.endsWith("myworkdaysite.com")
    ? "myworkdaysite-recruiting"
    : "cxs-jobs-endpoint";

  return {
    inputUrl: input,
    kind,
    origin,
    host,
    tenant,
    site,
    shard,
    cxsJobsUrl: buildCxsJobsUrl(origin, tenant, site),
    canonicalCareersUrl: buildCanonicalCareersUrl(origin, host, tenant, site),
  };
}

function parseExistingCxsJobEndpoint(
  input: string,
): WorkdayJobSourceConfig | null {
  const url = toUrl(input);
  const host = url.hostname.toLowerCase();
  const origin = url.origin;
  const segments = getPathSegments(url.pathname);
  const wdayIndex = segments.findIndex(
    (segment) => segment.toLowerCase() === "wday",
  );

  if (wdayIndex === -1) return null;

  const maybeCxs = segments[wdayIndex + 1]?.toLowerCase();
  const tenant = segments[wdayIndex + 2];
  const site = segments[wdayIndex + 3];
  const externalPathParts = segments.slice(wdayIndex + 4);

  if (maybeCxs !== "cxs") return null;

  if (
    !tenant ||
    !site ||
    externalPathParts.length === 0 ||
    externalPathParts[0]?.toLowerCase() === "jobs"
  ) {
    throw new WorkdayUrlParseError(
      "MISSING_CXS_PARTS",
      "Workday CXS job URL must look like /wday/cxs/{tenant}/{site}/job/{slug}.",
      input,
    );
  }

  const shard = extractShard(host);
  const canonicalCareersUrl = buildCanonicalCareersUrl(
    origin,
    host,
    tenant,
    site,
  );
  const externalPath = `/${externalPathParts.map(encodePathSegment).join("/")}`;

  return {
    inputUrl: input,
    kind: "cxs-jobs-endpoint",
    origin,
    host,
    tenant,
    site,
    shard,
    cxsJobsUrl: buildCxsJobsUrl(origin, tenant, site),
    canonicalCareersUrl,
    externalPath,
    cxsJobUrl: buildCxsJobUrl(origin, tenant, site, externalPath),
    canonicalJobUrl: `${canonicalCareersUrl}${externalPath}`,
  };
}

function parseLegacyMyworkdayjobsUrl(args: {
  input: string;
  origin: string;
  host: string;
  tenant: string;
  shard: string;
  segments: string[];
}): WorkdaySourceConfig {
  const { input, origin, host, tenant, shard, segments } = args;
  const { locale, rest } = peelLocale(segments);
  const site = rest[0];

  if (!site) {
    throw new WorkdayUrlParseError(
      "MISSING_SITE",
      "Legacy Workday URL is missing the careers site slug, for example /Ext or /External.",
      input,
    );
  }

  return {
    inputUrl: input,
    kind: "legacy-myworkdayjobs",
    origin,
    host,
    tenant,
    shard,
    locale,
    site,
    cxsJobsUrl: buildCxsJobsUrl(origin, tenant, site),
    canonicalCareersUrl: buildLegacyCareersUrl(origin, site, locale),
  };
}

function parseMyworkdaysiteRecruitingUrl(args: {
  input: string;
  origin: string;
  host: string;
  shard: string;
  segments: string[];
}): WorkdaySourceConfig {
  const { input, origin, host, shard, segments } = args;
  const { locale, rest } = peelLocale(segments);
  const recruitingIndex = rest.findIndex(
    (segment) => segment.toLowerCase() === "recruiting",
  );

  if (recruitingIndex === -1) {
    throw new WorkdayUrlParseError(
      "MISSING_RECRUITING_PARTS",
      "myworkdaysite.com URLs must include /recruiting/{tenant}/{site}.",
      input,
    );
  }

  const tenant = rest[recruitingIndex + 1];
  const site = rest[recruitingIndex + 2];

  if (!tenant || !site) {
    throw new WorkdayUrlParseError(
      "MISSING_RECRUITING_PARTS",
      "myworkdaysite.com URLs must include /recruiting/{tenant}/{site}.",
      input,
    );
  }

  return {
    inputUrl: input,
    kind: "myworkdaysite-recruiting",
    origin,
    host,
    tenant,
    site,
    shard,
    locale,
    cxsJobsUrl: buildCxsJobsUrl(origin, tenant, site),
    canonicalCareersUrl: buildMyworkdaysiteCareersUrl(
      origin,
      tenant,
      site,
      locale,
    ),
  };
}

function buildCxsJobsUrl(origin: string, tenant: string, site: string): string {
  return `${origin}/wday/cxs/${encodePathSegment(tenant)}/${encodePathSegment(site)}/jobs`;
}

function buildCxsJobUrl(
  origin: string,
  tenant: string,
  site: string,
  externalPath: string,
): string {
  const normalizedExternalPath = externalPath.startsWith("/")
    ? externalPath
    : `/${externalPath}`;

  return `${origin}/wday/cxs/${encodePathSegment(tenant)}/${encodePathSegment(site)}${encodePath(normalizedExternalPath)}`;
}

function buildCanonicalCareersUrl(
  origin: string,
  host: string,
  tenant: string,
  site: string,
): string {
  if (host.endsWith("myworkdaysite.com")) {
    return buildMyworkdaysiteCareersUrl(origin, tenant, site);
  }

  return buildLegacyCareersUrl(origin, site);
}

function buildLegacyCareersUrl(
  origin: string,
  site: string,
  locale?: string,
): string {
  const localePart = locale ? `/${encodePathSegment(locale)}` : "";
  return `${origin}${localePart}/${encodePathSegment(site)}`;
}

function buildMyworkdaysiteCareersUrl(
  origin: string,
  tenant: string,
  site: string,
  locale?: string,
): string {
  const localePart = locale ? `/${encodePathSegment(locale)}` : "";
  return `${origin}${localePart}/recruiting/${encodePathSegment(tenant)}/${encodePathSegment(site)}`;
}

function getJobExternalPath(
  input: string,
  source: WorkdaySourceConfig,
  segments: string[],
): string {
  if (source.kind === "cxs-jobs-endpoint") {
    const wdayIndex = segments.findIndex(
      (segment) => segment.toLowerCase() === "wday",
    );
    const rest = segments.slice(wdayIndex + 4);

    if (rest[0]?.toLowerCase() === "jobs") {
      throw new WorkdayUrlParseError(
        "MISSING_CXS_PARTS",
        "Workday CXS job URL must include a job path after /wday/cxs/{tenant}/{site}.",
        input,
      );
    }

    if (rest.length > 0) return `/${rest.map(encodePathSegment).join("/")}`;
  }

  if (source.kind === "legacy-myworkdayjobs") {
    const { rest } = peelLocale(segments);
    const externalPathParts = rest.slice(1);
    if (externalPathParts.length > 0) {
      return `/${externalPathParts.map(encodePathSegment).join("/")}`;
    }
  }

  if (source.kind === "myworkdaysite-recruiting") {
    const { rest } = peelLocale(segments);
    const recruitingIndex = rest.findIndex(
      (segment) => segment.toLowerCase() === "recruiting",
    );
    const externalPathParts = rest.slice(recruitingIndex + 3);
    if (externalPathParts.length > 0) {
      return `/${externalPathParts.map(encodePathSegment).join("/")}`;
    }
  }

  throw new WorkdayUrlParseError(
    "MISSING_SITE",
    "Workday job URL is missing the job path, for example /job/{slug}.",
    input,
  );
}

function toUrl(input: string): URL {
  const trimmed = input.trim();

  if (!trimmed) {
    throw new WorkdayUrlParseError("EMPTY_URL", "Workday URL is empty.", input);
  }

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    const url = new URL(withScheme);
    url.hash = "";
    url.search = "";
    return url;
  } catch {
    throw new WorkdayUrlParseError(
      "INVALID_URL",
      `Invalid URL: ${input}`,
      input,
    );
  }
}

function getPathSegments(pathname: string): string[] {
  return pathname
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

function peelLocale(segments: string[]): { locale?: string; rest: string[] } {
  const [first, ...rest] = segments;

  if (first && isLocaleSegment(first)) {
    return { locale: first, rest };
  }

  return { rest: segments };
}

function isLocaleSegment(segment: string): boolean {
  return /^[a-z]{2}(?:-[A-Z]{2})?$/.test(segment);
}

function extractShard(host: string): string | undefined {
  return host.match(/(?:^|\.)(wd\d+)\./i)?.[1];
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment);
}

function encodePath(path: string): string {
  return path.split("/").map(encodePathSegment).join("/");
}

function choosePreferredCompanySlug(source: WorkdaySourceConfig): string {
  const tenantKey = normalizeCompanySlug(source.tenant);
  const siteKey = normalizeCompanySlug(source.site);

  if (!siteKey) return source.tenant;
  if (siteKey === tenantKey) return source.site;
  if (isGenericWorkdaySiteSlug(source.site)) return source.tenant;

  return source.site;
}

function normalizeCompanySlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isGenericWorkdaySiteSlug(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  if (!normalized) return true;
  if (/^\d+$/.test(normalized)) return true;

  return [
    "careers",
    "career",
    "jobs",
    "job",
    "external",
    "ext",
    "default",
    "global",
  ].includes(normalized);
}

function formatCompanySlug(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "Workday";

  return trimmed
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z0-9]+$/.test(part)) return part;
      if (/^[a-z]{1,3}$/.test(part)) return part.toUpperCase();
      return `${part[0]?.toUpperCase() ?? ""}${part.slice(1).toLowerCase()}`;
    })
    .join(" ");
}
