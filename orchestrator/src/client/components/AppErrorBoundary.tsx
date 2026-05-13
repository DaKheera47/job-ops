import { AlertTriangle, ExternalLink, Home, RotateCcw } from "lucide-react";
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { GITHUB_REPO, getCurrentAppVersion } from "../lib/version";

type FatalErrorSource = "react" | "runtime" | "unhandledrejection";

export type FatalErrorSnapshot = {
  id: string;
  source: FatalErrorSource;
  name: string;
  message: string;
  stack: string | null;
  componentStack: string | null;
  route: string;
  appVersion: string;
  userAgent: string;
  timestamp: string;
};

const REDACTED = "[redacted]";
const REDACTED_LONG_VALUE = "[redacted-long-value]";
const MAX_TEXT_LENGTH = 6_000;
const AUTHORIZATION_PATTERN =
  /\b(authorization\s*[:=]\s*)(?:Bearer|Basic)?\s*[^\s,;{}]+/gi;
const SENSITIVE_ASSIGNMENT_PATTERN =
  /\b(cookie|password|passwd|secret|token|api[_-]?key|x-api-key|credential|set-cookie|proxy-authorization)(\s*[:=]\s*)(["']?)([^"'\s,;{}&]+)/gi;
const BEARER_TOKEN_PATTERN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi;
const JWT_PATTERN =
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const LONG_VALUE_PATTERN = /\b[A-Za-z0-9+/=_-]{80,}\b/g;

function truncateText(value: string): string {
  if (value.length <= MAX_TEXT_LENGTH) return value;
  return `${value.slice(0, MAX_TEXT_LENGTH)}\n...[truncated]`;
}

export function sanitizeCrashText(input: unknown): string {
  const text =
    typeof input === "string"
      ? input
      : input === undefined || input === null
        ? ""
        : String(input);

  return truncateText(text)
    .replace(AUTHORIZATION_PATTERN, `$1${REDACTED}`)
    .replace(SENSITIVE_ASSIGNMENT_PATTERN, `$1$2$3${REDACTED}`)
    .replace(BEARER_TOKEN_PATTERN, `Bearer ${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(LONG_VALUE_PATTERN, REDACTED_LONG_VALUE);
}

function stringifyUnknownError(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof Error) return input.message;
  if (input === null) return "null";
  if (input === undefined) return "undefined";

  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}

function toErrorParts(error: unknown): {
  name: string;
  message: string;
  stack: string | null;
} {
  if (error instanceof Error) {
    return {
      name: sanitizeCrashText(error.name || "Error"),
      message: sanitizeCrashText(error.message || "Unknown error"),
      stack: error.stack ? sanitizeCrashText(error.stack) : null,
    };
  }

  return {
    name: "Error",
    message: sanitizeCrashText(stringifyUnknownError(error)),
    stack: null,
  };
}

function currentRoute(): string {
  if (typeof window === "undefined") return "unknown";
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function userAgent(): string {
  if (typeof navigator === "undefined") return "unknown";
  return sanitizeCrashText(navigator.userAgent || "unknown");
}

export function createFatalErrorSnapshot(
  error: unknown,
  source: FatalErrorSource,
  options: { componentStack?: string | null; route?: string } = {},
): FatalErrorSnapshot {
  const parts = toErrorParts(error);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    source,
    name: parts.name,
    message: parts.message || "Unknown error",
    stack: parts.stack,
    componentStack: options.componentStack
      ? sanitizeCrashText(options.componentStack)
      : null,
    route: sanitizeCrashText(options.route ?? currentRoute()),
    appVersion: getCurrentAppVersion(),
    userAgent: userAgent(),
    timestamp: new Date().toISOString(),
  };
}

function issueBody(snapshot: FatalErrorSnapshot): string {
  const stack = snapshot.stack ?? "Not available";
  const componentStack = snapshot.componentStack ?? "Not available";

  return sanitizeCrashText(`## Client crash report

- App version: ${snapshot.appVersion}
- Route: ${snapshot.route}
- Source: ${snapshot.source}
- Time: ${snapshot.timestamp}
- Browser: ${snapshot.userAgent}

## Error

${snapshot.name}: ${snapshot.message}

## Stack

\`\`\`
${stack}
\`\`\`

## Component stack

\`\`\`
${componentStack}
\`\`\`

## Notes

Please add what you were doing before the app showed this screen.
`);
}

export function buildFatalIssueUrl(snapshot: FatalErrorSnapshot): string {
  const title = sanitizeCrashText(`Client crash: ${snapshot.message}`).slice(
    0,
    180,
  );
  const params = new URLSearchParams({
    title,
    body: issueBody(snapshot),
  });
  return `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`;
}

function formatDetails(snapshot: FatalErrorSnapshot): string {
  return `Version: ${snapshot.appVersion}
Route: ${snapshot.route}
Source: ${snapshot.source}
Time: ${snapshot.timestamp}
Browser: ${snapshot.userAgent}

${snapshot.name}: ${snapshot.message}

Stack:
${snapshot.stack ?? "Not available"}

Component stack:
${snapshot.componentStack ?? "Not available"}`;
}

export function FatalErrorScreen({
  onReload = () => window.location.reload(),
  snapshot,
}: {
  onReload?: () => void;
  snapshot: FatalErrorSnapshot;
}) {
  const issueUrl = buildFatalIssueUrl(snapshot);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <section className="w-full max-w-2xl space-y-6 rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-destructive/30 bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-2">
            <h1 className="text-2xl font-semibold tracking-normal">
              Something went wrong
            </h1>
            <p className="max-w-prose text-sm leading-6 text-muted-foreground">
              JobOps hit an unexpected client error. Your data should still be
              safe; reload the app or open a GitHub issue with the diagnostics
              below.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onReload}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Reload app
          </Button>
          <Button asChild variant="outline">
            <a href="/overview">
              <Home className="h-4 w-4" aria-hidden="true" />
              Go home
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={issueUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open GitHub issue
            </a>
          </Button>
        </div>

        <details className="rounded-md border border-border bg-muted/30 p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Technical details
          </summary>
          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-muted-foreground">
            {formatDetails(snapshot)}
          </pre>
        </details>
      </section>
    </main>
  );
}

class ReactCrashBoundary extends React.Component<
  { children: React.ReactNode; route: string },
  { snapshot: FatalErrorSnapshot | null }
> {
  state: { snapshot: FatalErrorSnapshot | null } = { snapshot: null };

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    this.setState({
      snapshot: createFatalErrorSnapshot(error, "react", {
        componentStack: info.componentStack,
        route: this.props.route,
      }),
    });
  }

  componentDidUpdate(previousProps: { route: string }) {
    if (this.state.snapshot && previousProps.route !== this.props.route) {
      this.setState({ snapshot: null });
    }
  }

  render() {
    if (this.state.snapshot) {
      return <FatalErrorScreen snapshot={this.state.snapshot} />;
    }

    return this.props.children;
  }
}

export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const route = `${location.pathname}${location.search}${location.hash}`;
  const [globalSnapshot, setGlobalSnapshot] =
    useState<FatalErrorSnapshot | null>(null);

  useEffect(() => {
    setGlobalSnapshot((current) => (current?.route === route ? current : null));
  }, [route]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      event.preventDefault();
      setGlobalSnapshot(
        createFatalErrorSnapshot(event.error ?? event.message, "runtime", {
          route,
        }),
      );
    };
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      event.preventDefault();
      setGlobalSnapshot(
        createFatalErrorSnapshot(event.reason, "unhandledrejection", {
          route,
        }),
      );
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
      );
    };
  }, [route]);

  if (globalSnapshot) {
    return <FatalErrorScreen snapshot={globalSnapshot} />;
  }

  return <ReactCrashBoundary route={route}>{children}</ReactCrashBoundary>;
}
