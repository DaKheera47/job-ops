import { PageHeader, PageMain } from "@client/components/layout";
import { useOnboardingStatus } from "@client/hooks/useOnboardingStatus";
import type {
  OnboardingRequirement,
  OnboardingRequirementPrimaryAction,
} from "@shared/types";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  KeyRound,
  LockKeyhole,
  type LucideIcon,
  RefreshCw,
  RotateCcw,
  Sparkles,
  UserPlus,
} from "lucide-react";
import type React from "react";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  type AuthUser,
  type CodexAuthStatusResponse,
  getAppStatus,
  getAuthBootstrapStatus,
  hasAuthenticatedSession,
  setupFirstAdmin,
} from "@/client/api";
import { queryKeys } from "@/client/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { bucketDurationMs, trackProductEvent } from "@/lib/analytics";
import { rememberAuthUser } from "../lib/remembered-auth-users";
import {
  getEndpointMode,
  getErrorCategory,
  getModelSource,
  getNextStep,
  getRequirementAnalyticsStatus,
  getRequirementStatusOrMissing,
  getStepIndex,
  getTextLengthBucket,
  toAnalyticsStep,
} from "./onboarding/analytics";
import { OnboardingCoach } from "./onboarding/components/OnboardingCoach";
import { OnboardingStepContent } from "./onboarding/components/OnboardingStepContent";
import { OnboardingStepRail } from "./onboarding/components/OnboardingStepRail";
import type {
  OnboardingPanelId,
  StepId,
  ValidationState,
} from "./onboarding/types";
import { useOnboardingFlow } from "./onboarding/useOnboardingFlow";

const TOTAL_ONBOARDING_STEPS = 4;
const DEFAULT_ONBOARDING_PANELS: OnboardingPanelId[] = [
  "account",
  "model",
  "resume",
  "first-run",
];
const ACCOUNT_PREVIEW_RAIL_ITEMS: Array<{
  id: OnboardingPanelId;
  label: string;
  subtitle: string;
  icon: LucideIcon;
}> = [
  { id: "account", label: "Account", subtitle: "Workspace", icon: UserPlus },
  { id: "model", label: "Model", subtitle: "Connection", icon: Circle },
  { id: "resume", label: "Resume", subtitle: "Source", icon: Circle },
  { id: "first-run", label: "First run", subtitle: "Launch", icon: Circle },
];

function getRequirement(
  requirements: OnboardingRequirement[],
  id: OnboardingRequirement["id"],
) {
  return requirements.find((requirement) => requirement.id === id) ?? null;
}

function toValidationState(
  requirement: OnboardingRequirement | null,
): ValidationState {
  return {
    valid: requirement?.status === "ready",
    message:
      requirement?.status === "ready" ? null : (requirement?.message ?? null),
    status: null,
    checked: Boolean(requirement),
    hydrated: Boolean(requirement),
  };
}

function getActionLabel(action: OnboardingRequirementPrimaryAction): string {
  switch (action) {
    case "connect_model":
      return "Verify LLM connection";
    case "connect_rxresume":
      return "Connect Reactive Resume";
    case "select_rxresume_template":
      return "Save template";
    case "upload_resume":
      return "Upload or recheck";
    case "recheck":
      return "Recheck";
    case "none":
      return "Continue";
  }
}

function getPanelStepLabel(
  panel: OnboardingPanelId,
  panels = DEFAULT_ONBOARDING_PANELS,
): string {
  const stepIndex = panels.indexOf(panel);
  return `Step ${Math.max(stepIndex, 0) + 1} of ${panels.length}`;
}

function useOnboardingDropoffAnalytics(args: {
  activePanel: OnboardingPanelId;
  complete: boolean;
  getRequirementStatus: () => ReturnType<typeof getRequirementAnalyticsStatus>;
  hadErrorVisible: boolean;
}) {
  const startedAtRef = useRef(Date.now());
  const activePanelRef = useRef(args.activePanel);
  const completeRef = useRef(args.complete);
  const getRequirementStatusRef = useRef(args.getRequirementStatus);
  const hadErrorVisibleRef = useRef(args.hadErrorVisible);
  const finishedRef = useRef(false);
  const exitTrackedRef = useRef(false);
  const inactiveTrackedRef = useRef(new Set<"2m" | "5m" | "10m">());

  useEffect(() => {
    activePanelRef.current = args.activePanel;
    completeRef.current = args.complete;
    getRequirementStatusRef.current = args.getRequirementStatus;
    hadErrorVisibleRef.current = args.hadErrorVisible;
  }, [
    args.activePanel,
    args.complete,
    args.getRequirementStatus,
    args.hadErrorVisible,
  ]);

  const markCompleted = useCallback(() => {
    finishedRef.current = true;
  }, []);

  const trackExit = useCallback(
    (exitType: "route_change" | "tab_hidden" | "unload") => {
      if (
        finishedRef.current ||
        completeRef.current ||
        exitTrackedRef.current
      ) {
        return;
      }
      exitTrackedRef.current = true;
      trackProductEvent("onboarding_exited", {
        last_step: toAnalyticsStep(activePanelRef.current),
        last_requirement_status: getRequirementStatusRef.current(),
        duration_bucket: bucketDurationMs(Date.now() - startedAtRef.current),
        exit_type: exitType,
      });
    },
    [],
  );

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        trackExit("tab_hidden");
      }
    };
    const handleBeforeUnload = () => trackExit("unload");

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("beforeunload", handleBeforeUnload);
      trackExit("route_change");
    };
  }, [trackExit]);

  useEffect(() => {
    const thresholds: Array<{ bucket: "2m" | "5m" | "10m"; ms: number }> = [
      { bucket: "2m", ms: 120_000 },
      { bucket: "5m", ms: 300_000 },
      { bucket: "10m", ms: 600_000 },
    ];
    let timeouts: number[] = [];

    const schedule = () => {
      for (const timeout of timeouts) window.clearTimeout(timeout);
      timeouts = thresholds.map(({ bucket, ms }) =>
        window.setTimeout(() => {
          if (
            finishedRef.current ||
            completeRef.current ||
            inactiveTrackedRef.current.has(bucket)
          ) {
            return;
          }
          inactiveTrackedRef.current.add(bucket);
          trackProductEvent("onboarding_inactive", {
            last_step: toAnalyticsStep(activePanelRef.current),
            idle_bucket: bucket,
            had_error_visible: hadErrorVisibleRef.current,
          });
        }, ms),
      );
    };

    const reset = () => schedule();
    schedule();
    window.addEventListener("click", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("input", reset);
    return () => {
      for (const timeout of timeouts) window.clearTimeout(timeout);
      window.removeEventListener("click", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("input", reset);
    };
  }, []);

  return markCompleted;
}

export const OnboardingPage: React.FC = () => {
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [bootstrapState, setBootstrapState] = useState<
    | { status: "checking" }
    | { status: "account_required" }
    | { status: "launch" }
    | { status: "error"; message: string }
  >({ status: "checking" });
  const startedTrackedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const attempt = bootstrapAttempt;

    void (async () => {
      try {
        const bootstrap = await getAuthBootstrapStatus();
        if (cancelled || attempt !== bootstrapAttempt) return;
        setBootstrapState({
          status: bootstrap.setupRequired ? "account_required" : "launch",
        });
      } catch (error) {
        if (cancelled || attempt !== bootstrapAttempt) return;
        setBootstrapState({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Unable to check onboarding setup.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapAttempt]);

  useEffect(() => {
    if (
      startedTrackedRef.current ||
      (bootstrapState.status !== "account_required" &&
        bootstrapState.status !== "launch")
    ) {
      return;
    }

    startedTrackedRef.current = true;
    trackProductEvent("onboarding_started", {
      entry_state: bootstrapState.status,
      next_step:
        bootstrapState.status === "account_required" ? "account" : "none",
      has_session: hasAuthenticatedSession(),
      demo_mode: false,
    });
  }, [bootstrapState.status]);

  if (bootstrapState.status === "checking") {
    return (
      <>
        <PageHeader
          icon={Sparkles}
          title="Launch Console"
          subtitle="Create your account, then load the model and resume Job Ops needs."
        />
        <PageMain>
          <Card className="border-border/60 bg-card shadow-none">
            <CardContent className="flex min-h-[24rem] items-center justify-center text-sm text-muted-foreground">
              Loading launch console...
            </CardContent>
          </Card>
        </PageMain>
      </>
    );
  }

  if (bootstrapState.status === "error") {
    return (
      <>
        <PageHeader
          icon={Sparkles}
          title="Launch Console"
          subtitle="Create your account, then load the model and resume Job Ops needs."
        />
        <PageMain>
          <Card className="border-border/60 bg-card shadow-none">
            <CardContent className="space-y-4 p-6">
              <p className="text-sm text-destructive" role="alert">
                {bootstrapState.message}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setBootstrapState({ status: "checking" });
                  setBootstrapAttempt((attempt) => attempt + 1);
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </CardContent>
          </Card>
        </PageMain>
      </>
    );
  }

  if (bootstrapState.status === "account_required") {
    return (
      <AccountSetupOnboarding
        onAccountCreated={(user) => {
          rememberAuthUser({
            username: user.username,
            displayName: user.displayName,
          });
          setBootstrapState({ status: "launch" });
        }}
      />
    );
  }

  return <LaunchOnboardingPage />;
};

const AccountSetupOnboarding: React.FC<{
  onAccountCreated: (user: AuthUser) => void;
}> = ({ onAccountCreated }) => {
  const [activePanel, setActivePanel] = useState<OnboardingPanelId>("account");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coachReplayNonce, setCoachReplayNonce] = useState(0);
  const getActiveRequirementStatus = useCallback(
    () =>
      getRequirementAnalyticsStatus({
        panel: activePanel,
        complete: false,
        requirement: null,
      }),
    [activePanel],
  );
  const markOnboardingCompleted = useOnboardingDropoffAnalytics({
    activePanel,
    complete: false,
    getRequirementStatus: getActiveRequirementStatus,
    hadErrorVisible: Boolean(errorMessage),
  });

  useEffect(() => {
    trackProductEvent("onboarding_step_viewed", {
      step: toAnalyticsStep(activePanel),
      step_index: getStepIndex(activePanel),
      requirement_status: getActiveRequirementStatus(),
    });
  }, [activePanel, getActiveRequirementStatus]);

  useEffect(() => {
    if (!errorMessage) return;
    trackProductEvent("onboarding_error_shown", {
      step: toAnalyticsStep(activePanel),
      error_category: "account",
    });
  }, [activePanel, errorMessage]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activePanel !== "account") {
      setActivePanel("account");
      return;
    }

    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setErrorMessage("Enter both username and password.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    trackProductEvent("onboarding_account_create_submitted", {
      has_display_name: Boolean(displayName.trim()),
      username_length_bucket: getTextLengthBucket(normalizedUsername),
    });

    try {
      const user = await setupFirstAdmin({
        username: normalizedUsername,
        password,
        displayName: displayName.trim() || normalizedUsername,
      });
      trackProductEvent("onboarding_account_create_completed", {
        result: "success",
        credential_length_bucket: getTextLengthBucket(password),
      });
      markOnboardingCompleted();
      onAccountCreated(user);
    } catch (error) {
      trackProductEvent("onboarding_account_create_completed", {
        result: "error",
        credential_length_bucket: getTextLengthBucket(password),
        error_category: getErrorCategory(error),
      });
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to create account",
      );
      setIsBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Launch Console"
        subtitle="Create your workspace account, then load the model and resume Job Ops needs."
      />

      <PageMain className="space-y-4">
        <OnboardingCoach
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          replayNonce={coachReplayNonce}
          scope="account"
          status={null}
        />

        <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
          <Card className="border-border/60 bg-card shadow-none">
            <CardHeader className="space-y-1.5 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Launch checks</CardTitle>
                <span className="text-xs text-muted-foreground">
                  0/{TOTAL_ONBOARDING_STEPS}
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                Start with a private workspace account, then connect the
                services Job Ops needs.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3" data-onboarding-target="launch-rail">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Progress</span>
                  <span>0%</span>
                </div>
                <div className="space-y-1">
                  {ACCOUNT_PREVIEW_RAIL_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setActivePanel(item.id)}
                      data-onboarding-target={`account-rail-${item.id}`}
                      className={`flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors ${
                        activePanel === item.id
                          ? "bg-muted/40"
                          : "text-muted-foreground hover:bg-muted/25"
                      }`}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                          activePanel === item.id
                            ? "border-primary/70 bg-transparent text-primary"
                            : "border-border/60 bg-muted/40 text-muted-foreground"
                        }`}
                      >
                        <item.icon
                          className={
                            item.id === "account" || activePanel === item.id
                              ? "h-4 w-4"
                              : "h-3 w-3"
                          }
                        />
                      </span>
                      <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                        <span className="block text-sm font-medium">
                          {item.label}
                        </span>
                        <span className="block text-xs leading-5">
                          {item.subtitle}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                onClick={() => {
                  trackProductEvent("onboarding_coach_interacted", {
                    action: "replay",
                    scope: "account",
                    step: toAnalyticsStep(activePanel),
                  });
                  setCoachReplayNonce((value) => value + 1);
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Replay guide
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card shadow-none">
            <form
              className="flex min-h-[30rem] flex-col"
              onSubmit={handleSubmit}
            >
              <CardHeader className="space-y-3 border-b border-border/60 px-6 py-5">
                <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>{getPanelStepLabel(activePanel)}</span>
                </div>
                <div className="space-y-1.5">
                  <CardTitle className="text-2xl leading-tight">
                    {activePanel === "account"
                      ? "Create your workspace account"
                      : activePanel === "model"
                        ? "Connect your model"
                        : activePanel === "resume"
                          ? "Load your resume"
                          : "Prepare the first run"}
                  </CardTitle>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    {activePanel === "account"
                      ? "This account owns the first private Job Ops workspace and can manage users later from Settings."
                      : "This step unlocks after the workspace account exists, but you can preview how the setup will continue."}
                  </p>
                </div>
              </CardHeader>

              <CardContent className="flex flex-1 flex-col gap-5 px-6 pt-5">
                {activePanel === "account" ? (
                  <div
                    className="space-y-5"
                    data-onboarding-target="account-form"
                  >
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label
                          className="text-sm font-medium"
                          htmlFor="onboarding-display-name"
                        >
                          Name
                        </label>
                        <Input
                          id="onboarding-display-name"
                          autoComplete="name"
                          value={displayName}
                          onChange={(event) =>
                            setDisplayName(event.currentTarget.value)
                          }
                          placeholder="Your name"
                          disabled={isBusy}
                        />
                      </div>
                      <div className="space-y-2">
                        <label
                          className="text-sm font-medium"
                          htmlFor="onboarding-username"
                        >
                          Username
                        </label>
                        <Input
                          id="onboarding-username"
                          autoComplete="username"
                          value={username}
                          onChange={(event) =>
                            setUsername(event.currentTarget.value)
                          }
                          placeholder="admin"
                          disabled={isBusy}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label
                        className="text-sm font-medium"
                        htmlFor="onboarding-password"
                      >
                        Password
                      </label>
                      <Input
                        id="onboarding-password"
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) =>
                          setPassword(event.currentTarget.value)
                        }
                        placeholder="At least 8 characters"
                        disabled={isBusy}
                      />
                    </div>
                    {errorMessage ? (
                      <p className="text-sm text-destructive" role="alert">
                        {errorMessage}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div
                    className="rounded-lg border border-border/60 bg-muted/10 p-4"
                    data-onboarding-target={
                      activePanel === "model"
                        ? "model-form"
                        : activePanel === "resume"
                          ? "resume-options"
                          : "first-run"
                    }
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background text-muted-foreground">
                        <LockKeyhole className="h-4 w-4" />
                      </span>
                      <div className="space-y-2">
                        <div className="text-sm font-medium">
                          Account required first
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          {activePanel === "model"
                            ? "After account creation, this panel will verify the LLM provider, base URL, API key, and model Job Ops should use."
                            : activePanel === "resume"
                              ? "After account creation, this panel will let you upload a resume or connect Reactive Resume as the matching baseline."
                              : "After model and resume checks pass, Job Ops will prepare search terms and open the ready queue."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>

              <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                  {activePanel === "account"
                    ? "Passwords stay in this Job Ops instance."
                    : "Create the workspace account to unlock this setup step."}
                </div>
                <Button
                  type="submit"
                  disabled={isBusy}
                  data-onboarding-target="primary-action"
                >
                  {activePanel === "account"
                    ? isBusy
                      ? "Creating account..."
                      : "Create account"
                    : "Create account first"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </PageMain>
    </>
  );
};

const LaunchOnboardingPage: React.FC = () => {
  const flow = useOnboardingFlow();
  const onboarding = useOnboardingStatus();
  const appStatusQuery = useQuery({
    queryKey: queryKeys.app.status(),
    queryFn: getAppStatus,
  });
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState<OnboardingPanelId>("model");
  const [coachReplayNonce, setCoachReplayNonce] = useState(0);
  const launchStartedAtRef = useRef(Date.now());
  const codexAutoSaveAttemptedRef = useRef(false);
  const searchTermsAttemptedRef = useRef(false);
  const trackedModelConfigFieldsRef = useRef(
    new Set<"provider" | "endpoint" | "api_key" | "model">(),
  );
  const isAppStatusLoading = appStatusQuery.isLoading && !appStatusQuery.data;
  const showAccountStep = appStatusQuery.data?.appMode !== "hosted";
  const showModelStep =
    appStatusQuery.data?.capabilities.userEditableLlmSettings ?? true;
  const visiblePanels = useMemo(
    () =>
      DEFAULT_ONBOARDING_PANELS.filter((panel) => {
        if (panel === "account") return showAccountStep;
        if (panel === "model") return showModelStep;
        return true;
      }),
    [showAccountStep, showModelStep],
  );
  const visibleRequirements = useMemo(
    () =>
      onboarding.requirements.filter(
        (requirement) => requirement.id !== "model" || showModelStep,
      ),
    [onboarding.requirements, showModelStep],
  );
  const fallbackPanel = useMemo<OnboardingPanelId>(() => {
    if (
      onboarding.nextRequirementId &&
      visiblePanels.includes(onboarding.nextRequirementId)
    ) {
      return onboarding.nextRequirementId;
    }
    if (onboarding.complete) return "first-run";
    return visiblePanels.includes("model") ? "model" : "resume";
  }, [onboarding.complete, onboarding.nextRequirementId, visiblePanels]);

  const modelRequirement = useMemo(
    () => getRequirement(visibleRequirements, "model"),
    [visibleRequirements],
  );
  const resumeRequirement = useMemo(
    () => getRequirement(visibleRequirements, "resume"),
    [visibleRequirements],
  );
  const activeRequirement =
    activePanel === "account" || activePanel === "first-run"
      ? null
      : getRequirement(onboarding.requirements, activePanel);
  const getActiveRequirementStatus = useCallback(
    () =>
      getRequirementAnalyticsStatus({
        panel: activePanel,
        complete: onboarding.complete,
        requirement: activeRequirement,
      }),
    [activePanel, activeRequirement, onboarding.complete],
  );
  const markOnboardingCompleted = useOnboardingDropoffAnalytics({
    activePanel,
    complete: onboarding.complete,
    getRequirementStatus: getActiveRequirementStatus,
    hadErrorVisible:
      activeRequirement?.status === "invalid" ||
      activeRequirement?.status === "checking_unavailable" ||
      Boolean(onboarding.error),
  });

  useEffect(() => {
    if (isAppStatusLoading) return;
    trackProductEvent("onboarding_step_viewed", {
      step: toAnalyticsStep(activePanel),
      step_index: getStepIndex(activePanel),
      requirement_status: getActiveRequirementStatus(),
    });
  }, [activePanel, getActiveRequirementStatus, isAppStatusLoading]);

  useEffect(() => {
    if (!onboarding.status || onboarding.checking || isAppStatusLoading) return;
    trackProductEvent("onboarding_status_checked", {
      complete: onboarding.complete,
      next_step: getNextStep(onboarding.nextRequirementId, onboarding.complete),
      model_status: getRequirementStatusOrMissing(modelRequirement),
      resume_status: getRequirementStatusOrMissing(resumeRequirement),
    });
  }, [
    modelRequirement,
    isAppStatusLoading,
    onboarding.checking,
    onboarding.complete,
    onboarding.nextRequirementId,
    onboarding.status,
    resumeRequirement,
  ]);

  useEffect(() => {
    if (
      activePanel === "account" ||
      activePanel === "first-run" ||
      !activeRequirement ||
      (activeRequirement.status !== "invalid" &&
        activeRequirement.status !== "checking_unavailable")
    ) {
      return;
    }
    trackProductEvent("onboarding_error_shown", {
      step: toAnalyticsStep(activePanel),
      error_category:
        activeRequirement.status === "checking_unavailable"
          ? "unavailable"
          : "validation",
    });
  }, [activePanel, activeRequirement]);

  const trackModelConfigChanged = useCallback(
    (
      changedField: "provider" | "endpoint" | "api_key" | "model",
      next?: {
        provider?: string;
        endpoint?: string;
        model?: string;
      },
    ) => {
      if (trackedModelConfigFieldsRef.current.has(changedField)) return;
      trackedModelConfigFieldsRef.current.add(changedField);
      trackProductEvent("onboarding_model_config_changed", {
        provider: next?.provider ?? flow.selectedProvider,
        changed_field: changedField,
        endpoint_mode: getEndpointMode(
          next?.endpoint ?? flow.watch("llmBaseUrl"),
        ),
        has_saved_key: Boolean(flow.llmKeyHint),
        model_source: getModelSource(next?.model ?? flow.watch("model")),
      });
    },
    [flow],
  );

  useEffect(() => {
    if (isAppStatusLoading) return;
    if (!visiblePanels.includes(activePanel)) {
      setActivePanel(fallbackPanel);
      return;
    }
    if (
      onboarding.nextRequirementId &&
      visiblePanels.includes(onboarding.nextRequirementId)
    ) {
      setActivePanel(onboarding.nextRequirementId);
      return;
    }
    if (onboarding.complete) {
      setActivePanel("first-run");
    }
  }, [
    activePanel,
    fallbackPanel,
    isAppStatusLoading,
    onboarding.complete,
    onboarding.nextRequirementId,
    visiblePanels,
  ]);

  useEffect(() => {
    if (
      !onboarding.complete ||
      flow.demoMode ||
      activePanel !== "first-run" ||
      flow.settingsLoading ||
      flow.hasSavedSearchTerms ||
      flow.isGeneratingSearchTerms ||
      searchTermsAttemptedRef.current
    ) {
      return;
    }

    searchTermsAttemptedRef.current = true;
    void flow.ensureSearchTerms({ trigger: "auto" });
  }, [
    activePanel,
    flow.demoMode,
    flow.ensureSearchTerms,
    flow.hasSavedSearchTerms,
    flow.isGeneratingSearchTerms,
    flow.settingsLoading,
    onboarding.complete,
  ]);

  const handleCodexAuthStatusChange = useCallback(
    (status: CodexAuthStatusResponse) => {
      if (flow.selectedProvider !== "codex") {
        codexAutoSaveAttemptedRef.current = false;
        return;
      }

      if (!status.authenticated) {
        if (!status.loginInProgress) codexAutoSaveAttemptedRef.current = false;
        return;
      }

      if (
        codexAutoSaveAttemptedRef.current ||
        flow.isBusy ||
        modelRequirement?.status === "ready"
      ) {
        return;
      }

      codexAutoSaveAttemptedRef.current = true;
      void flow.handleSaveModel().then((nextStatus) => {
        if (!nextStatus) {
          codexAutoSaveAttemptedRef.current = false;
          return;
        }
        if (nextStatus.complete) setActivePanel("first-run");
      });
    },
    [flow, modelRequirement?.status],
  );

  if (flow.demoMode) {
    return <Navigate to="/jobs/ready" replace />;
  }

  if (isAppStatusLoading) {
    return (
      <>
        <PageHeader
          icon={Sparkles}
          title="Launch Console"
          subtitle="Loading the launch checks Job Ops needs before it can work your search."
        />
        <PageMain>
          <Card className="border-border/60 bg-card shadow-none">
            <CardContent className="flex min-h-[24rem] items-center justify-center text-sm text-muted-foreground">
              Loading launch console...
            </CardContent>
          </Card>
        </PageMain>
      </>
    );
  }

  const llmValidation = toValidationState(modelRequirement);
  const baseResumeValidation = toValidationState(resumeRequirement);
  const rxresumeValidation: ValidationState = {
    ...baseResumeValidation,
    valid:
      resumeRequirement?.primaryAction === "select_rxresume_template" ||
      Boolean(flow.rxresumeApiKeyHint) ||
      baseResumeValidation.valid,
  };
  const completedCount =
    visibleRequirements.filter((requirement) => requirement.status === "ready")
      .length +
    (showAccountStep ? 1 : 0) +
    (onboarding.complete ? 1 : 0);
  const totalSteps = visiblePanels.length;

  const submitActivePanel = async () => {
    if (activePanel === "account") {
      setActivePanel(fallbackPanel);
      return;
    }
    if (activePanel === "model") {
      if (!showModelStep) {
        setActivePanel(fallbackPanel);
        return;
      }
      const status = await flow.handleSaveModel();
      if (status?.complete) setActivePanel("first-run");
      return;
    }
    if (activePanel === "resume") {
      if (flow.resumeSetupMode === "rxresume") {
        const status = await flow.handleSaveRxresume();
        if (status?.complete) setActivePanel("first-run");
        return;
      }
      await onboarding.refetch();
      return;
    }
    if (activePanel === "first-run") {
      const ready = await flow.ensureSearchTerms({ trigger: "manual" });
      if (!ready) return;
    }
    markOnboardingCompleted();
    trackProductEvent("onboarding_completed", {
      duration_bucket: bucketDurationMs(
        Date.now() - launchStartedAtRef.current,
      ),
      completed_steps: completedCount,
      search_terms_source:
        flow.searchTermsSource ??
        (flow.hasSavedSearchTerms ? "existing" : "unknown"),
    });
    navigate("/jobs/ready", { replace: true });
  };

  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Launch Console"
        subtitle={
          showModelStep
            ? "Load the LLM and resume Job Ops needs before it can work your search."
            : "Load the resume Job Ops needs before it can work your search."
        }
      />

      <PageMain className="space-y-4">
        <OnboardingCoach
          activePanel={activePanel}
          onPanelChange={(panel) => {
            if (visiblePanels.includes(panel)) setActivePanel(panel);
          }}
          replayNonce={coachReplayNonce}
          showAccount={showAccountStep}
          showModel={showModelStep}
          status={onboarding.status}
        />

        <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
          <Card className="border-border/60 bg-card shadow-none">
            <CardHeader className="space-y-1.5 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Launch checks</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {completedCount}/{totalSteps}
                </span>
              </div>
              <p className="text-xs leading-5 text-muted-foreground">
                These checks unlock scoring, matching, tailoring, and email
                classification.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <OnboardingStepRail
                activePanel={activePanel}
                complete={onboarding.complete}
                nextRequirementId={onboarding.nextRequirementId}
                onPanelSelect={setActivePanel}
                requirements={visibleRequirements}
                showAccount={showAccountStep}
                showModel={showModelStep}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                onClick={() => {
                  trackProductEvent("onboarding_coach_interacted", {
                    action: "replay",
                    scope: "launch",
                    step: toAnalyticsStep(activePanel),
                  });
                  setCoachReplayNonce((value) => value + 1);
                }}
              >
                <RotateCcw className="h-4 w-4" />
                Replay guide
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card shadow-none">
            {onboarding.checking ||
            flow.settingsLoading ||
            isAppStatusLoading ? (
              <CardContent className="flex min-h-[24rem] items-center justify-center text-sm text-muted-foreground">
                Loading launch console...
              </CardContent>
            ) : (
              <form
                className="flex min-h-[30rem] flex-col"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitActivePanel();
                }}
              >
                <CardHeader className="space-y-3 border-b border-border/60 px-6 py-5">
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    <span>{getPanelStepLabel(activePanel, visiblePanels)}</span>
                    {activePanel === "account" ||
                    activeRequirement?.status === "ready" ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Complete
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <CardTitle className="text-2xl leading-tight">
                      {activePanel === "account"
                        ? "Workspace account created"
                        : activePanel === "first-run"
                          ? "Ready for the first run"
                          : activeRequirement?.title}
                    </CardTitle>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      {activePanel === "account"
                        ? "Your private workspace is ready. Finish the model and resume checks so Job Ops can work from the right account context."
                        : activePanel === "first-run"
                          ? showModelStep
                            ? "Your model and resume are loaded. Job Ops can start turning job leads into ranked, actionable work."
                            : "Your resume is loaded. Job Ops can start turning job leads into ranked, actionable work."
                          : activeRequirement?.status === "ready"
                            ? activeRequirement.message
                            : "Complete this setup check to unlock the next part of your job-search workflow."}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-5 px-6 pt-5">
                  {showAccountStep &&
                  activePanel !== "account" &&
                  activePanel !== "first-run" ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Workspace account created</span>
                    </div>
                  ) : null}

                  {showModelStep &&
                  modelRequirement?.status === "ready" &&
                  activePanel !== "model" &&
                  activePanel !== "first-run" ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{modelRequirement.title}</span>
                    </div>
                  ) : null}

                  {resumeRequirement?.status === "ready" &&
                  activePanel !== "resume" &&
                  activePanel !== "first-run" ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{resumeRequirement.title}</span>
                    </div>
                  ) : null}

                  {activePanel === "account" ? (
                    <div
                      className="rounded-lg border border-border/60 bg-muted/10 p-4"
                      data-onboarding-target="account-complete"
                    >
                      <div className="space-y-2">
                        <div className="text-sm font-medium">
                          Account is set
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          This workspace is now tied to your Job Ops account.
                          Continue with the LLM and resume setup checks to
                          unlock scoring, tailoring, and application workflows.
                        </p>
                      </div>
                    </div>
                  ) : activePanel === "model" || activePanel === "resume" ? (
                    <OnboardingStepContent
                      baseResumeValidation={baseResumeValidation}
                      baseResumeValue={flow.watch("rxresumeBaseResumeId")}
                      currentStep={activePanel as StepId}
                      defaultModel={flow.settings?.model?.default}
                      effectiveModel={flow.settings?.model?.value}
                      isBusy={flow.isBusy}
                      importingResumeFileName={flow.importingResumeFileName}
                      isImportingResume={flow.isImportingResume}
                      isResumeReady={baseResumeValidation.valid}
                      isRxResumeSelfHosted={flow.isRxResumeSelfHosted}
                      llmApiKey={flow.watch("llmApiKey")}
                      llmBaseUrl={flow.watch("llmBaseUrl")}
                      llmKeyHint={flow.llmKeyHint}
                      llmValidation={llmValidation}
                      model={flow.watch("model")}
                      resumeSetupMode={flow.resumeSetupMode}
                      rxresumeApiKey={flow.watch("rxresumeApiKey")}
                      rxresumeApiKeyHint={flow.rxresumeApiKeyHint}
                      rxresumeUrl={flow.watch("rxresumeUrl")}
                      rxresumeValidation={rxresumeValidation}
                      savedBaseUrl={flow.settings?.llmBaseUrl?.value}
                      savedProvider={flow.settings?.llmProvider?.value}
                      selectedProvider={flow.selectedProvider}
                      onLlmApiKeyChange={(value) => {
                        trackModelConfigChanged("api_key");
                        flow.setValue("llmApiKey", value, {
                          shouldDirty: true,
                        });
                      }}
                      onLlmBaseUrlChange={(value) => {
                        trackModelConfigChanged("endpoint", {
                          endpoint: value,
                        });
                        flow.setValue("llmBaseUrl", value, {
                          shouldDirty: true,
                        });
                      }}
                      onLlmModelChange={(value) => {
                        trackModelConfigChanged("model", { model: value });
                        flow.setValue("model", value, { shouldDirty: true });
                      }}
                      onCodexAuthStatusChange={handleCodexAuthStatusChange}
                      onLlmProviderChange={(value) => {
                        trackModelConfigChanged("provider", {
                          provider: value,
                        });
                        flow.setValue("llmProvider", value, {
                          shouldDirty: true,
                        });
                      }}
                      onImportResumeFile={flow.handleImportResumeFile}
                      onResumeSetupModeChange={flow.setResumeSetupMode}
                      onRxresumeApiKeyChange={(value) =>
                        flow.setValue("rxresumeApiKey", value)
                      }
                      onRxresumeSelfHostedChange={
                        flow.handleRxresumeSelfHostedChange
                      }
                      onRxresumeUrlChange={(value) =>
                        flow.setValue("rxresumeUrl", value)
                      }
                      onTemplateResumeChange={flow.handleTemplateResumeChange}
                    />
                  ) : (
                    <div
                      className="rounded-lg border border-border/60 bg-muted/10 p-4"
                      data-onboarding-target="first-run"
                    >
                      <div className="space-y-2">
                        <div className="text-sm font-medium">
                          Command centre is loaded
                        </div>
                        <p className="text-sm leading-6 text-muted-foreground">
                          Job Ops prepares search terms from your resume before
                          opening the ready queue. You can still tune advanced
                          search controls later from the run modal or Settings.
                        </p>
                      </div>
                      <div className="mt-4 space-y-3">
                        {flow.isGeneratingSearchTerms ? (
                          <p className="text-sm text-muted-foreground">
                            Preparing resume-based search terms...
                          </p>
                        ) : flow.savedSearchTerms.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {flow.savedSearchTerms.map((term) => (
                              <span
                                key={term}
                                className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs text-muted-foreground"
                              >
                                {term}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={flow.isBusy}
                            onClick={() =>
                              void flow.ensureSearchTerms({
                                force: true,
                                trigger: "manual",
                              })
                            }
                          >
                            <RefreshCw className="h-4 w-4" />
                            Prepare search terms
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>

                <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => void onboarding.refetch()}
                    disabled={flow.isBusy || onboarding.checking}
                  >
                    <RefreshCw className="h-4 w-4" />
                    Recheck
                  </Button>

                  <Button
                    type="submit"
                    disabled={
                      flow.isBusy ||
                      flow.isGeneratingSearchTerms ||
                      (activePanel === "first-run" && !onboarding.complete)
                    }
                    data-onboarding-target="primary-action"
                  >
                    {activePanel === "account"
                      ? "Continue setup"
                      : activePanel === "first-run"
                        ? flow.isGeneratingSearchTerms
                          ? "Preparing search terms..."
                          : "Open ready queue"
                        : getActionLabel(
                            activeRequirement?.primaryAction ?? "none",
                          )}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            )}
          </Card>
        </div>
      </PageMain>
    </>
  );
};
