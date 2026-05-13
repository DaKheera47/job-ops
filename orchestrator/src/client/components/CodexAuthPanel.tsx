import * as api from "@client/api";
import { CheckCircle2, Copy, ExternalLink, Loader2 } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type CodexAuthPanelProps = {
  isBusy: boolean;
};

type CodexAuthStatus = Awaited<ReturnType<typeof api.getCodexAuthStatus>>;
type AsyncCodexAction = () => Promise<CodexAuthStatus>;

const TWO_MINUTES_MS = 2 * 60 * 1000;
const COPY_FEEDBACK_MS = 1800;
const POLL_INTERVAL_MS = 4_000;

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function CodexAuthPanelShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-md border border-border bg-card p-3">
      {children}
    </div>
  );
}

function CodexAuthError({ message }: { message: string | null }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

function StepIcon({
  isComplete,
  isLoading = false,
  step,
}: {
  isComplete: boolean;
  isLoading?: boolean;
  step: number;
}) {
  if (isComplete) {
    return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />;
  }

  if (isLoading) {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-700" />;
  }

  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px]">
      {step}
    </span>
  );
}

function StepRow({
  isComplete,
  isLoading,
  label,
  step,
}: {
  isComplete: boolean;
  isLoading?: boolean;
  label: string;
  step: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <StepIcon isComplete={isComplete} isLoading={isLoading} step={step} />
      <span>{label}</span>
    </div>
  );
}

export const CodexAuthPanel: React.FC<CodexAuthPanelProps> = ({ isBusy }) => {
  const [codexAuthStatus, setCodexAuthStatus] =
    useState<CodexAuthStatus | null>(null);
  const [isLoadingCodexAuthStatus, setIsLoadingCodexAuthStatus] =
    useState(false);
  const [isStartingCodexAuth, setIsStartingCodexAuth] = useState(false);
  const [isDisconnectingCodexAuth, setIsDisconnectingCodexAuth] =
    useState(false);
  const [codexAuthError, setCodexAuthError] = useState<string | null>(null);
  const [hasCopiedCode, setHasCopiedCode] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const runCodexAuthAction = useCallback(
    async (
      action: AsyncCodexAction,
      fallbackErrorMessage: string,
      setLoading: (isLoading: boolean) => void,
    ) => {
      setLoading(true);
      setCodexAuthError(null);
      try {
        const status = await action();
        setCodexAuthStatus(status);
      } catch (error) {
        setCodexAuthError(getErrorMessage(error, fallbackErrorMessage));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const refreshCodexAuthStatus = useCallback(
    async (showLoading = true) => {
      if (!showLoading) {
        setCodexAuthError(null);
        try {
          const status = await api.getCodexAuthStatus();
          setCodexAuthStatus(status);
        } catch (error) {
          setCodexAuthError(
            getErrorMessage(error, "Failed to load Codex sign-in status."),
          );
        }
        return;
      }

      await runCodexAuthAction(
        api.getCodexAuthStatus,
        "Failed to load Codex sign-in status.",
        setIsLoadingCodexAuthStatus,
      );
    },
    [runCodexAuthAction],
  );

  const startCodexAuth = useCallback(
    async (forceRestart = false) => {
      setHasCopiedCode(false);
      await runCodexAuthAction(
        () => api.startCodexAuth({ forceRestart }),
        "Failed to start Codex sign-in.",
        setIsStartingCodexAuth,
      );
    },
    [runCodexAuthAction],
  );

  const copyCode = useCallback(async () => {
    const code = codexAuthStatus?.userCode;
    if (!code) return;
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
      setCodexAuthError("Copy is not available in this browser.");
      return;
    }

    setCodexAuthError(null);
    try {
      await navigator.clipboard.writeText(code);
      setHasCopiedCode(true);
      window.setTimeout(() => setHasCopiedCode(false), COPY_FEEDBACK_MS);
    } catch (error) {
      setCodexAuthError(getErrorMessage(error, "Failed to copy code."));
    }
  }, [codexAuthStatus?.userCode]);

  const disconnectCodex = useCallback(async () => {
    setHasCopiedCode(false);
    await runCodexAuthAction(
      api.disconnectCodexAuth,
      "Failed to disconnect Codex.",
      setIsDisconnectingCodexAuth,
    );
  }, [runCodexAuthAction]);

  useEffect(() => {
    void refreshCodexAuthStatus();
  }, [refreshCodexAuthStatus]);

  useEffect(() => {
    if (!codexAuthStatus?.loginInProgress || codexAuthStatus.authenticated) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshCodexAuthStatus(false);
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    codexAuthStatus?.authenticated,
    codexAuthStatus?.loginInProgress,
    refreshCodexAuthStatus,
  ]);

  const expirationMs = useMemo(() => {
    if (!codexAuthStatus?.expiresAt) return null;
    const parsed = Date.parse(codexAuthStatus.expiresAt);
    return Number.isFinite(parsed) ? parsed : null;
  }, [codexAuthStatus?.expiresAt]);

  useEffect(() => {
    if (!expirationMs || codexAuthStatus?.authenticated) return;
    setNowMs(Date.now());

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1_000);
    return () => {
      window.clearInterval(timer);
    };
  }, [codexAuthStatus?.authenticated, expirationMs]);

  const remainingMs = expirationMs ? expirationMs - nowMs : null;
  const showExpiryCountdown =
    remainingMs !== null && remainingMs > 0 && remainingMs <= TWO_MINUTES_MS;

  const hasCode = Boolean(codexAuthStatus?.userCode);
  const hasVerificationUrl = Boolean(codexAuthStatus?.verificationUrl);
  const hasDevicePayload = hasCode && hasVerificationUrl;
  const isAuthenticated = Boolean(codexAuthStatus?.authenticated);
  const isWaitingForApproval =
    Boolean(codexAuthStatus?.loginInProgress) && !isAuthenticated;
  const hasActiveDevicePayload = hasDevicePayload && isWaitingForApproval;
  const displayUsername = codexAuthStatus?.username?.trim() || null;

  if (isAuthenticated) {
    return (
      <CodexAuthPanelShell>
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs font-medium">Codex Sign-In</div>
          <Badge
            className="gap-1 border-emerald-700 bg-emerald-700 text-white dark:border-emerald-300 dark:bg-emerald-300 dark:text-emerald-950"
            variant="outline"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Authenticated
          </Badge>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-300/60 bg-emerald-500/10 px-3 py-2">
          <p className="text-sm text-foreground">
            <span className="font-medium">Connected</span>
            {displayUsername ? ` as ${displayUsername}` : ""}.
          </p>
          <button
            type="button"
            className="text-xs font-medium text-destructive underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => void disconnectCodex()}
            disabled={isBusy || isDisconnectingCodexAuth}
          >
            {isDisconnectingCodexAuth ? "Disconnecting..." : "Disconnect"}
          </button>
        </div>

        <CodexAuthError message={codexAuthError} />
      </CodexAuthPanelShell>
    );
  }

  return (
    <CodexAuthPanelShell>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium">Codex Sign-In</div>
        {isWaitingForApproval ? (
          <div className="inline-flex items-center gap-1 text-xs text-amber-700">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Waiting for approval
          </div>
        ) : null}
      </div>

      <div className="rounded-md border border-border bg-card px-3 py-2 font-bold text-muted-foreground">
        Start sign-in to generate a one-time code. After approval in your
        browser, click{" "}
        <span className="font-medium text-foreground">Check Status</span>.{" "}
        <a
          href="https://developers.openai.com/codex/auth#preferred-device-code-authentication-beta"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn more
        </a>
      </div>

      <div className="space-y-1 text-xs text-muted-foreground">
        <StepRow
          isComplete={hasActiveDevicePayload}
          label="Start sign-in"
          step={1}
        />
        <StepRow
          isComplete={hasCopiedCode}
          label="Copy code and open verification page"
          step={2}
        />
        <StepRow
          isComplete={false}
          isLoading={isWaitingForApproval}
          label="Approve and return to JobOps"
          step={3}
        />
      </div>

      {hasActiveDevicePayload ? (
        <div className="space-y-2 rounded-lg border border-border bg-card p-3">
          <div className="text-center text-[11px] uppercase tracking-wide text-muted-foreground">
            One-time code
          </div>
          <div className="text-center font-mono text-2xl font-semibold tracking-widest text-foreground">
            {codexAuthStatus?.userCode}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => void copyCode()}
              disabled={isBusy}
            >
              <Copy className="h-3.5 w-3.5" />
              {hasCopiedCode ? "Copied" : "Copy code"}
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <a
                href={codexAuthStatus?.verificationUrl ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open verification page
              </a>
            </Button>
          </div>
          {showExpiryCountdown ? (
            <div className="text-center text-[11px] text-amber-700">
              Code expires in {formatRemaining(remainingMs)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {hasActiveDevicePayload ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={() => void refreshCodexAuthStatus()}
              disabled={isBusy || isLoadingCodexAuthStatus}
            >
              {isLoadingCodexAuthStatus ? "Checking..." : "Check Status"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void startCodexAuth(true)}
              disabled={isBusy || isStartingCodexAuth}
            >
              {isStartingCodexAuth ? "Starting..." : "Start New Sign-In"}
            </Button>
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => void startCodexAuth()}
            disabled={isBusy || isStartingCodexAuth}
          >
            {isStartingCodexAuth ? "Starting..." : "Start Sign-In"}
          </Button>
        )}
      </div>

      <CodexAuthError message={codexAuthError} />
      {codexAuthStatus?.flowMessage && !isAuthenticated ? (
        <p className="text-xs text-muted-foreground">
          {codexAuthStatus.flowMessage}
        </p>
      ) : null}
    </CodexAuthPanelShell>
  );
};
