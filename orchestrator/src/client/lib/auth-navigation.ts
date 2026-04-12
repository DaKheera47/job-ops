type AuthNavigator = (nextPath: string | null) => void;

let authNavigator: AuthNavigator | null = null;

export function setAuthNavigator(navigator: AuthNavigator | null): void {
  authNavigator = navigator;
}

export function getCurrentAppPath(): string {
  if (typeof window === "undefined") return "/jobs/ready";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
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
