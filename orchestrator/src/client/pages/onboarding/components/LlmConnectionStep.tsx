import * as api from "@client/api";
import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import {
  getLlmProviderConfig,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDERS,
  type LlmProviderId,
} from "@client/pages/settings/utils";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { type Control, Controller } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OnboardingFormData, ValidationState } from "../types";
import { InlineValidation } from "./InlineValidation";

function renderKeyHelper(
  helperText: string,
  helperHref: string | null,
  keepSavedKey: boolean,
) {
  return (
    <>
      {helperHref ? (
        <a
          href={helperHref}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
        >
          {helperText}
        </a>
      ) : (
        helperText
      )}
      {keepSavedKey ? ". Leave blank to keep the saved key." : null}
    </>
  );
}

export const LlmConnectionStep: React.FC<{
  control: Control<OnboardingFormData>;
  isBusy: boolean;
  llmKeyHint: string | null;
  selectedProvider: LlmProviderId;
  validation: ValidationState;
}> = ({ control, isBusy, llmKeyHint, selectedProvider, validation }) => {
  const providerConfig = getLlmProviderConfig(selectedProvider);
  const { showApiKey, showBaseUrl } = providerConfig;
  const isCodexProvider = providerConfig.normalizedProvider === "codex";
  const [codexAuthStatus, setCodexAuthStatus] = useState<Awaited<
    ReturnType<typeof api.getCodexAuthStatus>
  > | null>(null);
  const [isLoadingCodexAuthStatus, setIsLoadingCodexAuthStatus] =
    useState(false);
  const [isStartingCodexAuth, setIsStartingCodexAuth] = useState(false);
  const [codexAuthError, setCodexAuthError] = useState<string | null>(null);

  const refreshCodexAuthStatus = useCallback(
    async (showLoading = true) => {
      if (!isCodexProvider) return;
      if (showLoading) {
        setIsLoadingCodexAuthStatus(true);
      }
      setCodexAuthError(null);
      try {
        const status = await api.getCodexAuthStatus();
        setCodexAuthStatus(status);
      } catch (error) {
        setCodexAuthError(
          error instanceof Error
            ? error.message
            : "Failed to load Codex sign-in status.",
        );
      } finally {
        if (showLoading) {
          setIsLoadingCodexAuthStatus(false);
        }
      }
    },
    [isCodexProvider],
  );

  const startCodexAuth = useCallback(async () => {
    setIsStartingCodexAuth(true);
    setCodexAuthError(null);
    try {
      const status = await api.startCodexAuth();
      setCodexAuthStatus(status);
    } catch (error) {
      setCodexAuthError(
        error instanceof Error
          ? error.message
          : "Failed to start Codex sign-in.",
      );
    } finally {
      setIsStartingCodexAuth(false);
    }
  }, []);

  useEffect(() => {
    if (!isCodexProvider) {
      setCodexAuthStatus(null);
      setCodexAuthError(null);
      setIsLoadingCodexAuthStatus(false);
      setIsStartingCodexAuth(false);
      return;
    }

    void refreshCodexAuthStatus();
  }, [isCodexProvider, refreshCodexAuthStatus]);

  useEffect(() => {
    if (!isCodexProvider || !codexAuthStatus?.loginInProgress) {
      return;
    }
    if (codexAuthStatus.authenticated) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshCodexAuthStatus(false);
    }, 4_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [
    codexAuthStatus?.authenticated,
    codexAuthStatus?.loginInProgress,
    isCodexProvider,
    refreshCodexAuthStatus,
  ]);

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor="llmProvider" className="text-sm font-medium">
            Provider
          </label>
          <Controller
            name="llmProvider"
            control={control}
            render={({ field }) => (
              <Select
                value={selectedProvider}
                onValueChange={(value) => field.onChange(value)}
                disabled={isBusy}
              >
                <SelectTrigger id="llmProvider" className="h-10">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {LLM_PROVIDERS.map((provider) => (
                    <SelectItem key={provider} value={provider}>
                      {LLM_PROVIDER_LABELS[provider]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <p className="text-sm text-muted-foreground">
            {providerConfig.providerHint}
          </p>
          {isCodexProvider ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
              <div className="text-xs font-medium">Codex Sign-In</div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>Option 1: Start sign-in here with a one-time device code.</p>
                <p>
                  Option 2: Reuse host login (Docker) by setting{" "}
                  <span className="font-mono text-foreground">
                    CODEX_HOME_MOUNT
                  </span>{" "}
                  to your host{" "}
                  <span className="font-mono text-foreground">.codex</span>{" "}
                  path, then running{" "}
                  <span className="font-mono text-foreground">codex login</span>{" "}
                  on the host once.
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {codexAuthStatus?.authenticated
                  ? "Codex is authenticated and ready."
                  : "Start sign-in to get a device code, then complete it in your browser."}
              </p>
              {codexAuthStatus?.verificationUrl && codexAuthStatus?.userCode ? (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <div>
                    Code:{" "}
                    <span className="font-mono text-foreground">
                      {codexAuthStatus.userCode}
                    </span>
                  </div>
                  <div className="break-all">
                    URL:{" "}
                    <a
                      href={codexAuthStatus.verificationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
                    >
                      {codexAuthStatus.verificationUrl}
                    </a>
                  </div>
                  {codexAuthStatus.expiresAt ? (
                    <div>
                      Expires at:{" "}
                      {new Date(codexAuthStatus.expiresAt).toLocaleString()}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {codexAuthStatus?.validationMessage ? (
                <p className="text-xs text-muted-foreground">
                  Status: {codexAuthStatus.validationMessage}
                </p>
              ) : null}
              {codexAuthStatus?.flowMessage &&
              !codexAuthStatus.authenticated ? (
                <p className="text-xs text-muted-foreground">
                  {codexAuthStatus.flowMessage}
                </p>
              ) : null}
              {codexAuthError ? (
                <p className="text-xs text-destructive">{codexAuthError}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void startCodexAuth()}
                  disabled={isBusy || isStartingCodexAuth}
                >
                  {isStartingCodexAuth
                    ? "Starting..."
                    : codexAuthStatus?.authenticated
                      ? "Start New Sign-In"
                      : "Start Sign-In"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void refreshCodexAuthStatus()}
                  disabled={isBusy || isLoadingCodexAuthStatus}
                >
                  {isLoadingCodexAuthStatus ? "Checking..." : "Refresh Status"}
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {showBaseUrl ? (
          <Controller
            name="llmBaseUrl"
            control={control}
            render={({ field }) => (
              <SettingsInput
                label="Base URL"
                inputProps={{
                  name: "llmBaseUrl",
                  value: field.value,
                  onChange: field.onChange,
                }}
                placeholder={providerConfig.baseUrlPlaceholder}
                helper={providerConfig.baseUrlHelper}
                disabled={isBusy}
              />
            )}
          />
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {showApiKey ? (
          <Controller
            name="llmApiKey"
            control={control}
            render={({ field }) => (
              <SettingsInput
                label="API key"
                inputProps={{
                  name: "llmApiKey",
                  value: field.value,
                  onChange: field.onChange,
                }}
                type="password"
                placeholder="Paste a new key"
                helper={renderKeyHelper(
                  providerConfig.keyHelperText,
                  providerConfig.keyHelperHref,
                  Boolean(llmKeyHint),
                )}
                disabled={isBusy}
              />
            )}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
            No API key is required for this provider.
          </div>
        )}
      </div>

      <InlineValidation
        state={validation}
        successMessage={`${providerConfig.label} connection verified.`}
      />
    </div>
  );
};
