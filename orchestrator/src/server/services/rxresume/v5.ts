// rxresume/v5.ts
// Reactive Resume v5/OpenAPI implementation (API key auth).
import type { ResumeData } from "@shared/rxresume-schema";
import { resumeDataSchema } from "@shared/rxresume-schema";

type RxResumeApiConfig = { baseUrl?: string; apiKey?: string };

export type RxResumeListItem = {
  id: string;
  name: string;
  slug: string;
  tags: string[];
  isPublic: boolean;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
};

export type RxResumeGetByIdResponse = {
  id: string;
  name: string;
  slug: string;
  tags: string[];
  data: ResumeData | Record<string, unknown>;
  isPublic: boolean;
  isLocked: boolean;
  hasPassword: boolean;
  [key: string]: unknown;
};

export type RxResumeImportRequest = {
  data: ResumeData | unknown;
  // Not part of the documented v5 import schema, but accepted by some installs.
  name?: string;
  slug?: string;
};

export type RxResumeExportPdfResponse = {
  url: string;
};

export type VerifyApiKeyResult =
  | { ok: true }
  | { ok: false; status: number; message?: string; details?: unknown };

const MAX_ERROR_SNIPPET = 300;

function cleanBaseUrl(baseUrl: string): string {
  let normalized = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  if (normalized.endsWith("/api/openapi")) {
    normalized = normalized.slice(0, -12);
  } else if (normalized.endsWith("/api")) {
    normalized = normalized.slice(0, -4);
  }
  return normalized;
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "string") return data.slice(0, MAX_ERROR_SNIPPET);
  if (data && typeof data === "object") {
    const maybe = data as Record<string, unknown>;
    for (const key of ["message", "error", "statusMessage"]) {
      const value = maybe[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim().slice(0, MAX_ERROR_SNIPPET);
      }
    }
  }
  return fallback.slice(0, MAX_ERROR_SNIPPET);
}

async function executeWithKeyRetries(
  url: string,
  options: RequestInit,
  apiKeyOverride?: string,
): Promise<unknown> {
  const rawApiKey = apiKeyOverride ?? process.env.RXRESUME_API_KEY;
  if (!rawApiKey) {
    throw new Error("RXRESUME_API_KEY not configured in environment");
  }

  const apiKeys = rawApiKey
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (apiKeys.length === 0) {
    throw new Error("RXRESUME_API_KEY not configured in environment");
  }

  for (let attempt = 0; attempt < apiKeys.length; attempt++) {
    const apiKey = apiKeys[attempt];
    const headers = {
      "x-api-key": apiKey,
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    } as Record<string, string>;

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const errorBody = await response
        .json()
        .catch(async () => await response.text().catch(() => null));
      const errorMsg = extractErrorMessage(errorBody, response.statusText);

      if (
        response.status === 401 &&
        apiKeys.length > 1 &&
        attempt < apiKeys.length - 1
      ) {
        continue;
      }

      throw new Error(
        `Reactive Resume API error (${response.status}): ${errorMsg}`,
      );
    }

    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  throw new Error("All Reactive Resume API keys failed.");
}

/**
 * Generic fetch helper for Reactive Resume API
 */
export async function fetchRxResume(
  path: string,
  options: RequestInit = {},
  config?: RxResumeApiConfig,
): Promise<unknown> {
  const baseUrl =
    config?.baseUrl ?? process.env.RXRESUME_URL ?? "https://rxresu.me";
  const url = `${cleanBaseUrl(baseUrl)}/api/openapi${path}`;
  return executeWithKeyRetries(url, options, config?.apiKey);
}

/**
 * Fetch a resume by its ID.
 */
export async function getResume(
  id: string,
  config?: RxResumeApiConfig,
): Promise<RxResumeGetByIdResponse> {
  return (await fetchRxResume(
    `/resume/${id}`,
    {},
    config,
  )) as RxResumeGetByIdResponse;
}

export async function verifyApiKey(
  apiKey?: string,
  baseUrl?: string,
): Promise<VerifyApiKeyResult> {
  try {
    await fetchRxResume("/resume/list", {}, { apiKey, baseUrl });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Network error";
    const match = /error\s*\((\d+)\)/i.exec(message);
    return {
      ok: false,
      status: match ? Number(match[1]) : 0,
      message,
      details: error,
    };
  }
}

/**
 * Import a resume.
 */
export async function importResume(
  payload: RxResumeImportRequest,
  config?: RxResumeApiConfig,
): Promise<string> {
  payload.data = resumeDataSchema.parse(payload.data);

  const result = (await fetchRxResume(
    "/resume/import",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    config,
  )) as { id: string } | string;

  // Reactive Resume returns the full resume object on import in v4+, or just ID in v5.
  return typeof result === "string" ? result : result.id;
}

/**
 * Delete a resume.
 */
export async function deleteResume(
  id: string,
  config?: RxResumeApiConfig,
): Promise<void> {
  await fetchRxResume(`/resume/${id}`, { method: "DELETE" }, config);
}

/**
 * Export a resume as PDF. Returns the URL.
 */
export async function exportResumePdf(
  id: string,
  config?: RxResumeApiConfig,
): Promise<string> {
  const result = (await fetchRxResume(
    `/printer/resume/${id}/pdf`,
    {},
    config,
  )) as RxResumeExportPdfResponse;
  return result.url;
}

/**
 * List all resumes.
 * According to official OpenAPI spec, the endpoint is /resume/list
 */
export async function listResumes(config?: {
  baseUrl?: string;
  apiKey?: string;
}): Promise<RxResumeListItem[]> {
  return (await fetchRxResume(
    "/resume/list",
    {},
    config,
  )) as RxResumeListItem[];
}
