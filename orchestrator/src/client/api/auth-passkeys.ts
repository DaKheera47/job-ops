import type {
  PasskeyLoginOptionsResponse,
  PasskeyRegistrationOptionsResponse,
  PasskeySummary,
} from "@shared/types";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import type { AuthUser } from "./auth";
import { setAuthenticatedSession } from "./auth-session";
import { fetchApi, readAuthResponse, toApiError } from "./core";

/**
 * The login ceremony runs before a session exists, so it cannot go through
 * `fetchApi` (which would redirect to sign-in on the first 401).
 */
async function postWithoutSession<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const parsed = await readAuthResponse<T>(res);
  if ("ok" in parsed) {
    if (!parsed.ok) throw toApiError(res, parsed);
    return parsed.data as T;
  }
  if (!parsed.success) throw toApiError(res, parsed);
  return parsed.data as T;
}

export async function getPasskeyLoginOptions(): Promise<PasskeyLoginOptionsResponse> {
  return postWithoutSession<PasskeyLoginOptionsResponse>(
    "/api/auth/passkeys/login/options",
  );
}

export async function verifyPasskeyLogin(input: {
  challengeId: string;
  response: AuthenticationResponseJSON;
}): Promise<AuthUser> {
  const data = await postWithoutSession<{ token: string; user: AuthUser }>(
    "/api/auth/passkeys/login/verify",
    input,
  );
  if (!data?.token || !data.user) {
    throw new Error("Passkey sign-in response was incomplete");
  }
  setAuthenticatedSession(data.token);
  return data.user;
}

export async function getPasskeyRegistrationOptions(): Promise<PasskeyRegistrationOptionsResponse> {
  return fetchApi<PasskeyRegistrationOptionsResponse>(
    "/auth/passkeys/register/options",
    { method: "POST" },
  );
}

export async function verifyPasskeyRegistration(input: {
  name?: string;
  response: RegistrationResponseJSON;
}): Promise<PasskeySummary> {
  return fetchApi<PasskeySummary>("/auth/passkeys/register/verify", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function listPasskeys(): Promise<PasskeySummary[]> {
  return fetchApi<PasskeySummary[]>("/auth/passkeys");
}

export async function renamePasskey(
  id: string,
  name: string,
): Promise<PasskeySummary> {
  return fetchApi<PasskeySummary>(`/auth/passkeys/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deletePasskey(id: string): Promise<void> {
  await fetchApi<{ deleted: boolean }>(
    `/auth/passkeys/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
