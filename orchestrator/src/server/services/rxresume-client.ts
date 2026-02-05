// rxresume-client.ts
// Low-level HTTP client for the RxResume v4 API.
// - Handles login, token caching, and cookie-based auth.
// - Used by rxresume-v4.ts to provide a higher-level service surface.
// - The v5 client should be a drop-in replacement in the future.

import type { ResumeData } from "@shared/rxresume-schema";

type AnyObj = Record<string, unknown>;
const MAX_ERROR_SNIPPET = 300;

const TOKEN_COOKIE_NAMES = [
  "accessToken",
  "access_token",
  "token",
  "authToken",
  "auth_token",
  "Authentication",
  "Refresh",
];

function extractTokenFromCookies(
  rawCookies: string | string[] | null,
): string | null {
  if (!rawCookies) return null;
  const combined = Array.isArray(rawCookies)
    ? rawCookies.join("; ")
    : rawCookies;
  for (const name of TOKEN_COOKIE_NAMES) {
    const match = new RegExp(`${name}=([^;]+)`).exec(combined);
    if (match?.[1]) return match[1];
  }
  return null;
}

function buildAuthHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Cookie: `Authentication=${token}`,
  };
}

export type RxResumeResume = {
  id: string;
  name: string;
  title: string;
  slug?: string;
  data?: ResumeData;
  [key: string]: unknown;
};

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      // Message is best-effort; server responses vary.
      message?: string;
      // Some APIs include error codes/details.
      details?: unknown;
    };

interface CachedToken {
  token: string;
  expiresAt: number; // Unix timestamp
}

// Token cache: key is hash of baseURL + identifier
const tokenCache = new Map<string, CachedToken>();

// Default token TTL: 50 minutes (JWT tokens typically expire in 1 hour)
const DEFAULT_TOKEN_TTL_MS = 50 * 60 * 1000;

export class RxResumeClient {
  private readonly tokenTtlMs: number;

  constructor(
    private readonly baseURL = "https://v4.rxresu.me",
    options?: { tokenTtlMs?: number },
  ) {
    this.tokenTtlMs = options?.tokenTtlMs ?? DEFAULT_TOKEN_TTL_MS;
  }

  /**
   * Generate a cache key for token storage.
   * Uses a simple hash of baseURL + identifier.
   */
  private getCacheKey(identifier: string): string {
    return `${this.baseURL}:${identifier}`;
  }

  /**
   * Get a valid auth token, using cached token if available and not expired.
   * This is the preferred way to get a token for API calls.
   */
  async getToken(identifier: string, password: string): Promise<string> {
    const cacheKey = this.getCacheKey(identifier);
    const cached = tokenCache.get(cacheKey);

    // Return cached token if it exists and hasn't expired
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    // Login to get a new token
    const token = await this.login(identifier, password);

    // Cache the token
    tokenCache.set(cacheKey, {
      token,
      expiresAt: Date.now() + this.tokenTtlMs,
    });

    return token;
  }

  /**
   * Clear cached token for a specific identifier.
   * Useful when a token becomes invalid (e.g., 401 response).
   */
  clearCachedToken(identifier: string): void {
    const cacheKey = this.getCacheKey(identifier);
    tokenCache.delete(cacheKey);
  }

  /**
   * Clear all cached tokens.
   */
  static clearAllCachedTokens(): void {
    tokenCache.clear();
  }

  /**
   * Execute an API operation with automatic token refresh on 401.
   * If the operation fails with a 401, clears the cached token, gets a new one, and retries once.
   *
   * @param identifier - The user identifier (email)
   * @param password - The user password
   * @param operation - A function that takes a token and performs the API call
   * @returns The result of the operation
   */
  async withAutoRefresh<T>(
    identifier: string,
    password: string,
    operation: (token: string) => Promise<T>,
  ): Promise<T> {
    const token = await this.getToken(identifier, password);

    try {
      return await operation(token);
    } catch (error) {
      // Check if this is a 401 error
      const message = error instanceof Error ? error.message : "";
      const isAuthError =
        /HTTP\s*401/i.test(message) ||
        /Unauthorized/i.test(message) ||
        /Unauthenticated/i.test(message);

      if (isAuthError) {
        // Clear the cached token and retry with a fresh one
        this.clearCachedToken(identifier);
        const freshToken = await this.getToken(identifier, password);
        return await operation(freshToken);
      }

      // Re-throw non-401 errors
      throw error;
    }
  }

  /**
   * Verify a username/password combo WITHOUT persisting a logged-in session.
   *
   * Reality check:
   * - Most sites only expose "verify" by attempting login.
   * - This method does a stateless request to test credentials.
   */
  static async verifyCredentials(
    identifier: string,
    password: string,
    baseURL = "https://v4.rxresu.me",
  ): Promise<VerifyResult> {
    try {
      const res = await fetch(`${baseURL}/api/auth/login`, {
        method: "POST",
        headers: {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier, password }),
        // No credentials mode - we don't want to persist cookies
      });

      if (res.ok) return { ok: true };

      // Best-effort message extraction
      let data: AnyObj = {};
      try {
        const text = await res.text();
        data = text ? (JSON.parse(text) as AnyObj) : {};
      } catch {
        // Ignore JSON parse errors
      }

      const message =
        (typeof data === "string" ? data : undefined) ??
        (typeof data?.message === "string" ? data.message : undefined) ??
        (typeof data?.error === "string" ? data.error : undefined) ??
        (typeof data?.statusMessage === "string"
          ? data.statusMessage
          : undefined);

      return { ok: false, status: res.status, message, details: data };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        message: error instanceof Error ? error.message : "Network error",
        details: error,
      };
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RESERVED FOR FUTURE USE
  // The following methods support full resume lifecycle management via the
  // RxResume API. They are not currently used but are kept for future features.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/auth/login
   * Returns the auth token on success.
   */
  async login(identifier: string, password: string): Promise<string> {
    const res = await fetch(`${this.baseURL}/api/auth/login`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier, password }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Login failed: HTTP ${res.status} ${sanitizeResponseSnippet(text)}`,
      );
    }

    const data = (await res.json()) as AnyObj;
    // The API may return the token in different ways
    let token =
      data?.accessToken ??
      data?.access_token ??
      data?.token ??
      (data?.data as AnyObj)?.accessToken ??
      (data?.data as AnyObj)?.token;

    if (!token) {
      const setCookieHeader = res.headers.get("set-cookie");
      // getSetCookie is a newer method in standard Fetch API, but might not be in all environments
      // biome-ignore lint/suspicious/noExplicitAny: headers may not have getSetCookie in all types
      const setCookieArray = (res.headers as any).getSetCookie?.() as
        | string[]
        | undefined;
      token = extractTokenFromCookies(setCookieArray ?? setCookieHeader);
    }

    if (!token || typeof token !== "string") {
      throw new Error(
        "Login succeeded but could not locate access token in response.",
      );
    }

    return token;
  }

  /**
   * POST /api/resume/import
   */
  async create(
    resumeData: unknown,
    token: string,
    options?: { title?: string; slug?: string },
  ): Promise<string> {
    const payload: AnyObj = { data: resumeData };
    if (options?.title) payload.title = options.title;
    if (options?.slug) payload.slug = options.slug;
    const res = await fetch(`${this.baseURL}/api/resume/import`, {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        ...buildAuthHeaders(token),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Create failed: HTTP ${res.status} ${sanitizeResponseSnippet(text)}`,
      );
    }

    const d = (await res.json()) as AnyObj;
    const id =
      d?.id ??
      (d?.data as AnyObj)?.id ??
      (d?.resume as AnyObj)?.id ??
      (d?.result as AnyObj)?.id ??
      (d?.payload as AnyObj)?.id ??
      ((d?.data as AnyObj)?.resume as AnyObj)?.id;

    if (!id || typeof id !== "string") {
      throw new Error(
        "Create succeeded but could not locate resume id in response.",
      );
    }

    return id;
  }

  /**
   * GET /api/resume/print/:id
   * Returns the print URL from the response.
   */
  async print(resumeId: string, token: string): Promise<string> {
    const res = await fetch(
      `${this.baseURL}/api/resume/print/${encodeURIComponent(resumeId)}`,
      {
        method: "GET",
        headers: {
          Accept: "application/json, text/plain, */*",
          ...buildAuthHeaders(token),
        },
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Print failed: HTTP ${res.status} ${sanitizeResponseSnippet(text)}`,
      );
    }

    const d = (await res.json()) as AnyObj;
    const url =
      d?.url ??
      d?.href ??
      (d?.data as AnyObj)?.url ??
      (d?.data as AnyObj)?.href ??
      (d?.result as AnyObj)?.url ??
      (d?.result as AnyObj)?.href;

    if (!url || typeof url !== "string") {
      throw new Error("Print succeeded but could not locate URL in response.");
    }

    return url;
  }

  /**
   * DELETE /api/resume/:id
   */
  async delete(resumeId: string, token: string): Promise<void> {
    const res = await fetch(
      `${this.baseURL}/api/resume/${encodeURIComponent(resumeId)}`,
      {
        method: "DELETE",
        headers: {
          Accept: "application/json, text/plain, */*",
          ...buildAuthHeaders(token),
        },
      },
    );

    if (!res.ok && res.status !== 204) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Delete failed: HTTP ${res.status} ${sanitizeResponseSnippet(text)}`,
      );
    }
  }

  private normalizeResume(raw: AnyObj): RxResumeResume {
    const id = typeof raw.id === "string" ? raw.id : "";
    const title =
      typeof raw.title === "string"
        ? raw.title
        : typeof raw.name === "string"
          ? raw.name
          : "Untitled";
    const name = typeof raw.name === "string" ? raw.name : title;
    const slug = typeof raw.slug === "string" ? raw.slug : undefined;
    const data =
      raw.data && typeof raw.data === "object"
        ? (raw.data as ResumeData)
        : undefined;

    return {
      ...raw,
      id,
      title,
      name,
      slug,
      data,
    };
  }

  /**
   * GET /api/resume
   * List all resumes for the authenticated user.
   */
  async list(token: string): Promise<RxResumeResume[]> {
    const res = await fetch(`${this.baseURL}/api/resume`, {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        ...buildAuthHeaders(token),
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `List resumes failed: HTTP ${res.status} ${sanitizeResponseSnippet(text)}`,
      );
    }

    const data = (await res.json()) as AnyObj | AnyObj[];

    // API may return array directly or wrapped in data/resumes
    const resumes = Array.isArray(data)
      ? data
      : ((data?.data as AnyObj[]) ?? (data?.resumes as AnyObj[]) ?? []);

    return resumes
      .filter((resume) => resume && typeof resume === "object")
      .map((resume) => this.normalizeResume(resume as AnyObj));
  }

  /**
   * GET /api/resume
   * Fetch a single resume by ID (via list filtering).
   */
  async get(resumeId: string, token: string): Promise<RxResumeResume> {
    const resumes = await this.list(token);
    const resume = resumes.find((item) => item.id === resumeId);
    if (!resume) {
      throw new Error(`Resume not found: ${resumeId}`);
    }
    return resume;
  }
}

function sanitizeResponseSnippet(text: string): string {
  if (!text) return "";
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.slice(0, MAX_ERROR_SNIPPET);
}
