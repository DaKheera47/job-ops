import { queryClient } from "@/client/lib/queryClient";

export type AuthCredentials = {
  username: string;
  password: string;
};

type StoredLegacyAuthCredentials = AuthCredentials & {
  storedAt?: number;
};

const LEGACY_SESSION_AUTH_KEY = "jobops.basicAuthCredentials";
const LEGACY_SESSION_JWT_KEY = "jobops.jwtToken";
const SESSION_AUTH_TOKEN_KEY = "jobops.authToken";
const LEGACY_SESSION_AUTH_TTL_MS = 5 * 60 * 1000;

function decodeBase64UrlJsonSegment(
  segment: string,
): Record<string, unknown> | null {
  try {
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(
      normalized.length + ((4 - (normalized.length % 4)) % 4),
      "=",
    );
    const decoded = globalThis.atob(padded);
    const parsed = JSON.parse(decoded) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getTenantIdFromAuthToken(token: string | null): string | null {
  const payloadSegment = token?.split(".")[1];
  if (!payloadSegment) return null;
  const payload = decodeBase64UrlJsonSegment(payloadSegment);
  const tenantId = payload?.tenantId;
  return typeof tenantId === "string" && tenantId.trim().length > 0
    ? tenantId.trim()
    : null;
}

function loadStoredLegacyCredentials(): AuthCredentials | null {
  try {
    const stored = sessionStorage.getItem(LEGACY_SESSION_AUTH_KEY);
    if (!stored) return null;
    sessionStorage.removeItem(LEGACY_SESSION_AUTH_KEY);

    const parsed = JSON.parse(stored) as StoredLegacyAuthCredentials;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof parsed.username !== "string" ||
      typeof parsed.password !== "string"
    ) {
      return null;
    }

    if (
      typeof parsed.storedAt === "number" &&
      Date.now() - parsed.storedAt > LEGACY_SESSION_AUTH_TTL_MS
    ) {
      return null;
    }

    return {
      username: parsed.username,
      password: parsed.password,
    };
  } catch {
    return null;
  }
}

function storeLegacyCredentials(credentials: AuthCredentials | null): void {
  try {
    if (credentials) {
      sessionStorage.setItem(
        LEGACY_SESSION_AUTH_KEY,
        JSON.stringify({
          ...credentials,
          storedAt: Date.now(),
        } satisfies StoredLegacyAuthCredentials),
      );
    } else {
      sessionStorage.removeItem(LEGACY_SESSION_AUTH_KEY);
    }
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
}

function loadStoredAuthToken(): string | null {
  try {
    return (
      sessionStorage.getItem(SESSION_AUTH_TOKEN_KEY) ??
      sessionStorage.getItem(LEGACY_SESSION_JWT_KEY)
    );
  } catch {
    return null;
  }
}

function storeAuthToken(token: string | null): void {
  try {
    if (token) {
      sessionStorage.setItem(SESSION_AUTH_TOKEN_KEY, token);
      sessionStorage.removeItem(LEGACY_SESSION_JWT_KEY);
    } else {
      sessionStorage.removeItem(SESSION_AUTH_TOKEN_KEY);
      sessionStorage.removeItem(LEGACY_SESSION_JWT_KEY);
    }
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
}

export function getCurrentAuthWorkspaceStorageScope(): string | null {
  const tenantId = getTenantIdFromAuthToken(loadStoredAuthToken());
  return tenantId ? `workspace:${tenantId}` : null;
}

export function getAuthScopedStorageKey(baseKey: string): string {
  const scope = getCurrentAuthWorkspaceStorageScope();
  return scope ? `${baseKey}:${scope}` : baseKey;
}

let cachedLegacyCredentials: AuthCredentials | null =
  loadStoredLegacyCredentials();
let cachedAuthToken: string | null = loadStoredAuthToken();
let authMigrationInFlight: Promise<boolean> | null = null;

function clearCachedAppData(): void {
  queryClient.clear();
}

export function clearAuthSession(): void {
  clearCachedAppData();
  cachedLegacyCredentials = null;
  cachedAuthToken = null;
  storeLegacyCredentials(null);
  storeAuthToken(null);
}

export function setAuthenticatedSession(token: string): void {
  clearCachedAppData();
  cachedAuthToken = token;
  storeAuthToken(token);
  cachedLegacyCredentials = null;
  storeLegacyCredentials(null);
}

export function getCachedAuthHeader(): string | undefined {
  return cachedAuthToken ? `Bearer ${cachedAuthToken}` : undefined;
}

export function hasAuthenticatedSession(): boolean {
  return Boolean(cachedAuthToken);
}

export function getCachedAuthTokenForRequests(): string | null {
  return cachedAuthToken;
}

export function setCachedAuthTokenForRequests(token: string | null): void {
  cachedAuthToken = token;
  storeAuthToken(token);
}

export function consumeLegacyCredentialsForMigration(): AuthCredentials | null {
  if (!cachedLegacyCredentials) return null;
  const credentials = cachedLegacyCredentials;
  cachedLegacyCredentials = null;
  storeLegacyCredentials(null);
  return credentials;
}

export function getAuthMigrationInFlight(): Promise<boolean> | null {
  return authMigrationInFlight;
}

export function setAuthMigrationInFlight(
  promise: Promise<boolean> | null,
): void {
  authMigrationInFlight = promise;
}

export function __resetApiClientAuthForTests(): void {
  cachedLegacyCredentials = null;
  cachedAuthToken = null;
  authMigrationInFlight = null;
  storeLegacyCredentials(null);
  storeAuthToken(null);
}

export function __setLegacyAuthCredentialsForTests(
  credentials: AuthCredentials | null,
): void {
  cachedLegacyCredentials = credentials;
  storeLegacyCredentials(credentials);
}

export function __setAuthTokenForTests(token: string | null): void {
  cachedAuthToken = token;
  storeAuthToken(token);
}
