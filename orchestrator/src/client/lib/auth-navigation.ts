type AuthNavigator = (nextPath: string | null) => void;

const DEFAULT_APP_PATH = "/jobs/ready";

let authNavigator: AuthNavigator | null = null;

export function setAuthNavigator(navigator: AuthNavigator | null): void {
  authNavigator = navigator;
}

export function getCurrentAppPath(): string {
  if (typeof window === "undefined") return DEFAULT_APP_PATH;
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/**
 * `next` values arrive from the query string and from sign-in flows that
 * survive a round trip through an identity provider, so only in-app paths are
 * honoured: a leading `//` would be an off-site URL, and bouncing back into the
 * sign-in or SSO callback routes would loop.
 */
export function resolveNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_APP_PATH,
): string {
  if (!raw || !/^\/(?!\/)/.test(raw)) return fallback;
  if (raw.startsWith("/sign-in") || raw.startsWith("/sso/")) return fallback;
  return raw;
}

export function buildSignInPath(nextPath: string | null): string {
  const url = new URL("/sign-in", "http://localhost");
  if (
    nextPath &&
    nextPath !== "/sign-in" &&
    !nextPath.startsWith("/sign-in?")
  ) {
    url.searchParams.set("next", nextPath);
  }
  return `${url.pathname}${url.search}`;
}

export function redirectToSignIn(
  nextPath: string | null = getCurrentAppPath(),
): void {
  if (authNavigator) {
    authNavigator(nextPath);
    return;
  }

  if (typeof window !== "undefined") {
    window.location.assign(buildSignInPath(nextPath));
  }
}
