import { redirectToSignIn } from "@client/lib/auth-navigation";
import type { ApiResponse } from "@shared/types";
import { formatUserFacingError } from "@/client/lib/error-format";
import {
  clearAuthSession,
  consumeLegacyCredentialsForMigration,
  getAuthMigrationInFlight,
  getCachedAuthHeader,
  getCachedAuthTokenForRequests,
  setAuthenticatedSession,
  setAuthMigrationInFlight,
  setCachedAuthTokenForRequests,
} from "./auth-session";
import {
  getAnalyticsRequestHeaders,
  showDemoBlockedToast,
  showDemoSimulatedToast,
} from "./internal-shared";

export class ApiClientError extends Error {
  requestId?: string;
  status?: number;
  code?: string;

  constructor(
    message: string,
    options?: { requestId?: string; status?: number; code?: string },
  ) {
    super(message);
    this.name = "ApiClientError";
    this.requestId = options?.requestId;
    this.status = options?.status;
    this.code = options?.code;
  }
}

export type LegacyApiResponse<T> =
  | {
      success: true;
      data?: T;
      message?: string;
    }
  | {
      success: false;
      error?: string;
      message?: string;
      details?: unknown;
    };

export type StreamSseInput =
  | import("@shared/types").JobActionRequest
  | { content: string; selectedNoteIds?: string[]; stream: true }
  | { selectedNoteIds?: string[]; stream: true };

function describeAction(endpoint: string, method?: string): string {
  const verb = (method || "GET").toUpperCase();
  const normalized = endpoint.split("?")[0] || endpoint;
  if (verb === "POST" && normalized === "/pipeline/run") {
    return "Pipeline run used demo simulation.";
  }
  if (verb === "POST" && normalized.endsWith("/process")) {
    return "Job processing used demo simulation.";
  }
  if (verb === "POST" && normalized.endsWith("/summarize")) {
    return "Summary generation used demo simulation.";
  }
  if (verb === "POST" && normalized.endsWith("/generate-pdf")) {
    return "PDF generation used demo simulation.";
  }
  if (verb === "POST" && normalized.endsWith("/rescore")) {
    return "Suitability rescoring used demo simulation.";
  }
  if (verb === "POST" && normalized.endsWith("/apply")) {
    return "Apply flow used demo simulation and no external sync.";
  }
  if (normalized.startsWith("/onboarding/validate")) {
    return "Credential validation is simulated in demo mode.";
  }
  return "This action ran in demo simulation mode.";
}

export function normalizeHeaders(
  headers?: HeadersInit,
): Record<string, string> {
  if (!headers) return {};
  if (headers instanceof Headers) {
    const next: Record<string, string> = {};
    headers.forEach((value, key) => {
      next[key] = value;
    });
    return next;
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return { ...headers };
}

export function withQuery(
  path: string,
  params: Record<string, string | number | null | undefined>,
): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

export function normalizeApiResponse<T>(
  payload: unknown,
): ApiResponse<T> | LegacyApiResponse<T> {
  if (!payload || typeof payload !== "object") {
    throw new ApiClientError("API request failed: malformed JSON response");
  }
  const response = payload as Record<string, unknown>;
  if (typeof response.ok === "boolean") {
    return payload as ApiResponse<T>;
  }
  if (typeof response.success === "boolean") {
    return payload as LegacyApiResponse<T>;
  }
  throw new ApiClientError("API request failed: unexpected response shape");
}

function isUnauthorizedResponse<T>(
  response: Response,
  parsed: ApiResponse<T> | LegacyApiResponse<T>,
): boolean {
  if (response.status !== 401) return false;
  if ("ok" in parsed) {
    return parsed.ok ? false : parsed.error.code === "UNAUTHORIZED";
  }
  return !parsed.success;
}

export function toApiError<T>(
  response: Response,
  parsed: ApiResponse<T> | LegacyApiResponse<T>,
): ApiClientError {
  if ("ok" in parsed) {
    if (!parsed.ok) {
      return new ApiClientError(
        formatUserFacingError(
          {
            message: parsed.error.message || "API request failed",
            details: parsed.error.details,
          },
          "API request failed",
        ),
        {
          requestId: parsed.meta?.requestId,
          status: response.status,
          code: parsed.error.code,
        },
      );
    }
    return new ApiClientError("API request failed", {
      requestId: parsed.meta?.requestId,
      status: response.status,
    });
  }
  if (parsed.success) {
    return new ApiClientError(
      formatUserFacingError(parsed.message || "API request failed"),
      {
        status: response.status,
      },
    );
  }
  return new ApiClientError(
    formatUserFacingError(parsed, "API request failed"),
    {
      status: response.status,
    },
  );
}

export async function readAuthResponse<T>(
  response: Response,
): Promise<ApiResponse<T> | LegacyApiResponse<T>> {
  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ApiClientError(
      `Server error (${response.status}): Expected JSON but received HTML. Is the backend server running?`,
      { status: response.status },
    );
  }

  return normalizeApiResponse<T>(payload);
}

export async function performLoginWithCredentials(
  username: string,
  password: string,
): Promise<void> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  const parsed = await readAuthResponse<{ token: string }>(res);
  if ("ok" in parsed) {
    if (!parsed.ok) {
      throw toApiError(res, parsed);
    }
  } else if (!parsed.success) {
    throw toApiError(res, parsed);
  }

  const token =
    "ok" in parsed
      ? parsed.data?.token
      : (parsed.data as { token?: string } | undefined)?.token;
  if (!token) {
    throw new Error("No token returned");
  }
  setAuthenticatedSession(token);
}

export async function restoreAuthSessionFromLegacyCredentials(): Promise<boolean> {
  if (getCachedAuthTokenForRequests()) return true;
  const inFlight = getAuthMigrationInFlight();
  if (inFlight) return inFlight;

  const credentials = consumeLegacyCredentialsForMigration();
  if (!credentials) return false;

  const migration = (async () => {
    try {
      await performLoginWithCredentials(
        credentials.username,
        credentials.password,
      );
      return true;
    } catch {
      return false;
    } finally {
      setAuthMigrationInFlight(null);
    }
  })();

  setAuthMigrationInFlight(migration);
  return migration;
}

async function recoverAuthSessionFromUnauthorized(): Promise<string | null> {
  setCachedAuthTokenForRequests(null);

  const restored = await restoreAuthSessionFromLegacyCredentials();
  const authHeader = getCachedAuthHeader();
  if (restored && authHeader) {
    return authHeader;
  }

  clearAuthSession();
  redirectToSignIn();
  return null;
}

export async function recoverAuthHeaderAfterUnauthorized(): Promise<
  string | null
> {
  return recoverAuthSessionFromUnauthorized();
}

async function fetchAndParse<T>(
  endpoint: string,
  options: RequestInit | undefined,
  authHeader?: string,
): Promise<{
  response: Response;
  parsed: ApiResponse<T> | LegacyApiResponse<T>;
}> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAnalyticsRequestHeaders(),
    ...normalizeHeaders(options?.headers),
  };
  if (authHeader) headers.Authorization = authHeader;
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  const text = await response.text();

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new ApiClientError(
      `Server error (${response.status}): Expected JSON but received HTML. Is the backend server running?`,
      { status: response.status },
    );
  }
  const parsed = normalizeApiResponse<T>(payload);
  return { response, parsed };
}

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  let authHeader = getCachedAuthHeader();
  let authAttempt = 0;

  while (true) {
    const { response, parsed } = await fetchAndParse(
      endpoint,
      options,
      authHeader,
    );

    if (isUnauthorizedResponse(response, parsed) && authAttempt < 1) {
      const recoveredAuthHeader = await recoverAuthSessionFromUnauthorized();
      if (!recoveredAuthHeader) {
        throw toApiError(response, parsed);
      }
      authHeader = recoveredAuthHeader;
      authAttempt += 1;
      continue;
    }

    if ("ok" in parsed) {
      if (!parsed.ok) {
        if (parsed.error.code === "UNAUTHORIZED") {
          clearAuthSession();
          redirectToSignIn();
        }
        if (parsed.meta?.blockedReason) {
          showDemoBlockedToast(parsed.meta.blockedReason);
        }
        throw toApiError(response, parsed);
      }
      if (parsed.meta?.simulated) {
        showDemoSimulatedToast(describeAction(endpoint, options?.method));
      }
      return parsed.data as T;
    }

    if (!parsed.success) {
      if (response.status === 401) {
        clearAuthSession();
        redirectToSignIn();
      }
      throw toApiError(response, parsed);
    }

    const data = parsed.data;
    if (data !== undefined) return data as T;
    if (parsed.message !== undefined) return { message: parsed.message } as T;
    return null as T;
  }
}

export async function fetchBlobApi(
  endpoint: string,
  options?: RequestInit,
): Promise<Blob> {
  let authHeader = getCachedAuthHeader();
  let authAttempt = 0;

  while (true) {
    const headers: Record<string, string> = {
      ...getAnalyticsRequestHeaders(),
      ...normalizeHeaders(options?.headers),
    };
    if (authHeader) headers.Authorization = authHeader;
    const response = await fetch(`/api${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401 && authAttempt < 1) {
      const recoveredAuthHeader = await recoverAuthSessionFromUnauthorized();
      if (recoveredAuthHeader) {
        authHeader = recoveredAuthHeader;
        authAttempt += 1;
        continue;
      }
    }

    if (!response.ok) {
      const parsed = await readAuthResponse<never>(response);
      throw toApiError(response, parsed);
    }

    return response.blob();
  }
}

export function normalizeApiPath(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (!trimmed) {
    return "/design-resume/pdf";
  }

  if (trimmed.startsWith("/api/")) {
    return trimmed.slice(4);
  }

  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  return `/${trimmed}`;
}

export async function streamSseEvents<TEvent>(
  endpoint: string,
  input: StreamSseInput,
  handlers: {
    onEvent: (event: TEvent) => void;
    signal?: AbortSignal;
  },
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAnalyticsRequestHeaders(),
  };
  const streamAuth = getCachedAuthHeader();
  if (streamAuth) {
    headers.Authorization = streamAuth;
  }

  let response = await fetch(`/api${endpoint}`, {
    method: "POST",
    headers,
    body: JSON.stringify(input),
    signal: handlers.signal,
  });

  if (response.status === 401) {
    const recoveredAuthHeader = await recoverAuthSessionFromUnauthorized();
    if (recoveredAuthHeader) {
      response = await fetch(`/api${endpoint}`, {
        method: "POST",
        headers: {
          ...headers,
          Authorization: recoveredAuthHeader,
        },
        body: JSON.stringify(input),
        signal: handlers.signal,
      });
    }
  }

  if (!response.ok) {
    let errorMessage = `Stream request failed with status ${response.status}`;
    try {
      const payload = await response.json();
      const parsed = normalizeApiResponse(payload);
      if ("ok" in parsed && !parsed.ok) {
        errorMessage = formatUserFacingError(
          {
            message: parsed.error.message || errorMessage,
            details: parsed.error.details,
          },
          errorMessage,
        );
      }
    } catch {
      // ignore parse errors; keep status-based message
    }
    throw new ApiClientError(errorMessage, {
      status: response.status,
    });
  }

  if (!response.body) {
    throw new ApiClientError("Streaming not supported by this browser");
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let separatorIndex = buffer.indexOf("\n\n");
      while (separatorIndex !== -1) {
        const frame = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const dataLines = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean);

        for (const line of dataLines) {
          let parsedEvent: TEvent;
          try {
            parsedEvent = JSON.parse(line) as TEvent;
          } catch {
            continue;
          }
          handlers.onEvent(parsedEvent);
        }
        separatorIndex = buffer.indexOf("\n\n");
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Ignore cancellation errors when stream is already closed
    }
  }
}
