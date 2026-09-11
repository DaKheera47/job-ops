import type {
  SsoIdentitySummary,
  SsoProvider,
  SsoProviderInfo,
  SsoStartResponse,
} from "@shared/types";
import type { AuthUser } from "./auth";
import { setAuthenticatedSession } from "./auth-session";
import { ApiClientError, fetchApi, readAuthResponse, toApiError } from "./core";

export type SsoCallbackInput = {
  state: string;
  flowToken: string;
  callbackSearch: string;
};

export type SsoLoginResult = {
  token: string;
  expiresIn: number;
  user: AuthUser;
  created: boolean;
};

/**
 * The login half of SSO runs before there is a session, so these calls skip
 * `fetchApi` (and its redirect-to-sign-in recovery) the way `setupFirstAdmin`
 * does.
 */
async function requestPublicSso<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${path}`, init);
  const parsed = await readAuthResponse<T>(response);
  if ("ok" in parsed) {
    if (!parsed.ok) throw toApiError(response, parsed);
    return requireSsoData(parsed.data, response);
  }
  if (!parsed.success) throw toApiError(response, parsed);
  return requireSsoData(parsed.data, response);
}

function requireSsoData<T>(data: T | undefined, response: Response): T {
  if (data === undefined) {
    throw new ApiClientError("Single sign-on response was incomplete", {
      status: response.status,
    });
  }
  return data;
}

function ssoCallbackInit(input: SsoCallbackInput): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  };
}

export async function getSsoProviders(): Promise<SsoProviderInfo[]> {
  return requestPublicSso<SsoProviderInfo[]>("/auth/sso/providers");
}

export async function startSsoLogin(
  provider: SsoProvider,
): Promise<SsoStartResponse> {
  return requestPublicSso<SsoStartResponse>(`/auth/sso/${provider}/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
}

export async function completeSsoLogin(
  provider: SsoProvider,
  input: SsoCallbackInput,
): Promise<SsoLoginResult> {
  const result = await requestPublicSso<SsoLoginResult>(
    `/auth/sso/${provider}/callback`,
    ssoCallbackInit(input),
  );
  if (!result.token || !result.user) {
    throw new ApiClientError("Single sign-on response was incomplete");
  }
  setAuthenticatedSession(result.token);
  return result;
}

export async function startSsoLink(
  provider: SsoProvider,
): Promise<SsoStartResponse> {
  return fetchApi<SsoStartResponse>(`/auth/sso/${provider}/link/start`, {
    method: "POST",
    body: "{}",
  });
}

export async function completeSsoLink(
  provider: SsoProvider,
  input: SsoCallbackInput,
): Promise<SsoIdentitySummary> {
  return fetchApi<SsoIdentitySummary>(`/auth/sso/${provider}/link/callback`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listSsoIdentities(): Promise<SsoIdentitySummary[]> {
  return fetchApi<SsoIdentitySummary[]>("/auth/sso/identities");
}

export async function unlinkSsoIdentity(id: string): Promise<void> {
  await fetchApi<{ deleted: boolean }>(
    `/auth/sso/identities/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
