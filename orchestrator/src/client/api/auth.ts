import { redirectToSignIn } from "@client/lib/auth-navigation";
import type { AuthCredentials } from "./auth-session";
import {
  clearAuthSession,
  getCachedAuthHeader,
  setAuthenticatedSession,
} from "./auth-session";
import {
  fetchApi,
  performLoginWithCredentials,
  readAuthResponse,
  toApiError,
} from "./core";

export type CodexAuthStatusResponse = {
  authenticated: boolean;
  username: string | null;
  validationMessage: string | null;
  flowStatus: string;
  loginInProgress: boolean;
  verificationUrl: string | null;
  userCode: string | null;
  startedAt: string | null;
  expiresAt: string | null;
  flowMessage: string | null;
};

export type { AuthCredentials };

export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
  isSystemAdmin: boolean;
  isDisabled: boolean;
  workspaceId: string;
  workspaceName: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthBootstrapStatus = {
  setupRequired: boolean;
};

export async function signInWithCredentials(
  username: string,
  password: string,
): Promise<void> {
  return performLoginWithCredentials(username, password);
}

export async function getAuthBootstrapStatus(): Promise<AuthBootstrapStatus> {
  return fetchApi<AuthBootstrapStatus>("/auth/bootstrap-status");
}

export async function setupFirstAdmin(input: {
  username: string;
  password: string;
  displayName?: string;
}): Promise<AuthUser> {
  const res = await fetch("/api/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const parsed = await readAuthResponse<{
    token: string;
    user: AuthUser;
  }>(res);
  if ("ok" in parsed) {
    if (!parsed.ok) throw toApiError(res, parsed);
    if (!parsed.data?.token || !parsed.data.user) {
      throw new Error("Setup response was incomplete");
    }
    setAuthenticatedSession(parsed.data.token);
    return parsed.data.user;
  }
  if (!parsed.success) throw toApiError(res, parsed);
  const data = parsed.data as { token?: string; user?: AuthUser } | undefined;
  if (!data?.token || !data.user) {
    throw new Error("Setup response was incomplete");
  }
  setAuthenticatedSession(data.token);
  return data.user;
}

export async function getCurrentAuthUser(): Promise<AuthUser> {
  const result = await fetchApi<{ user: AuthUser }>("/auth/me");
  return result.user;
}

export {
  recoverAuthHeaderAfterUnauthorized,
  restoreAuthSessionFromLegacyCredentials,
} from "./core";

export async function logout(
  options: { redirect?: boolean } = {},
): Promise<void> {
  const authHeader = getCachedAuthHeader();
  if (authHeader) {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: authHeader },
      });
    } catch {
      // Best-effort server-side invalidation.
    }
  }
  clearAuthSession();
  if (options.redirect ?? true) {
    redirectToSignIn();
  }
}

export async function listWorkspaceUsers(): Promise<AuthUser[]> {
  const result = await fetchApi<{ users: AuthUser[] }>("/workspaces/users");
  return result.users;
}

export async function createWorkspaceUser(input: {
  username: string;
  password: string;
  displayName?: string;
  isSystemAdmin?: boolean;
}): Promise<AuthUser> {
  const result = await fetchApi<{ user: AuthUser }>("/workspaces/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return result.user;
}

export async function setWorkspaceUserDisabled(
  userId: string,
  isDisabled: boolean,
): Promise<AuthUser> {
  const result = await fetchApi<{ user: AuthUser }>(
    `/workspaces/users/${encodeURIComponent(userId)}/disabled`,
    {
      method: "PATCH",
      body: JSON.stringify({ isDisabled }),
    },
  );
  return result.user;
}

export async function resetWorkspaceUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  await fetchApi<{ userId: string }>(
    `/workspaces/users/${encodeURIComponent(userId)}/reset-password`,
    {
      method: "POST",
      body: JSON.stringify({ password }),
    },
  );
}

export async function changeOwnPassword(password: string): Promise<void> {
  await fetchApi<{ userId: string }>("/workspaces/me/password", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}
