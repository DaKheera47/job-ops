import { parseBamboohrUrl } from "./bamboohr-url";

export interface BamboohrCompanyInfoResponse {
  meta?: unknown;
  result?: {
    name?: string;
    logoUrl?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface NormalizedBamboohrCompanyInfo {
  name: string;
  logoUrl?: string;
  raw: BamboohrCompanyInfoResponse;
}

export interface FetchBamboohrCompanyInfoOptions {
  careersUrl: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  headers?: HeadersInit;
  userAgent?: string;
}

const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36";

export async function getCompanyInfo(
  options: FetchBamboohrCompanyInfoOptions,
): Promise<{ company: NormalizedBamboohrCompanyInfo }> {
  const fetchFn = options.fetchImpl ?? globalThis.fetch;
  if (!fetchFn) {
    throw new Error(
      "No fetch implementation available. Pass fetchImpl or use Node 18+.",
    );
  }

  const parsed = parseBamboohrUrl(options.careersUrl);
  const response = await fetchBamboohrJson<BamboohrCompanyInfoResponse>(
    fetchFn,
    {
      url: parsed.companyInfoUrl,
      signal: options.signal,
      headers: {
        accept: "application/json",
        referer: parsed.canonicalCareersUrl,
        "user-agent": options.userAgent ?? DEFAULT_USER_AGENT,
        ...options.headers,
      },
    },
  );

  return {
    company: normalizeBamboohrCompanyInfo(response, parsed.companyInfoUrl),
  };
}

export function normalizeBamboohrCompanyInfo(
  response: BamboohrCompanyInfoResponse,
  url: string,
): NormalizedBamboohrCompanyInfo {
  const result = response.result;
  if (!result) {
    throw new Error(
      `BambooHR company info response is missing result for ${url}.`,
    );
  }

  const name = requiredString(result.name, "name", url);
  return {
    name,
    logoUrl: optionalString(result.logoUrl),
    raw: response,
  };
}

async function fetchBamboohrJson<T>(
  fetchFn: typeof fetch,
  input: {
    url: string;
    signal?: AbortSignal;
    headers?: HeadersInit;
  },
): Promise<T> {
  const response = await fetchFn(input.url, {
    method: "GET",
    signal: input.signal,
    headers: input.headers,
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `BambooHR request failed with HTTP ${response.status} for ${input.url}.`,
    );
  }

  try {
    return JSON.parse(responseText) as T;
  } catch {
    throw new Error(`BambooHR response was not valid JSON for ${input.url}.`);
  }
}

function requiredString(
  value: unknown,
  fieldName: string,
  url: string,
): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(
    `BambooHR response is missing required field ${fieldName} for ${url}.`,
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
