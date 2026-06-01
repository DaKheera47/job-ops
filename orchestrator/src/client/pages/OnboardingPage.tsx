import { PageHeader, PageMain } from "@client/components/layout";
import { useOnboardingStatus } from "@client/hooks/useOnboardingStatus";
import type {
  OnboardingRequirement,
  OnboardingRequirementPrimaryAction,
} from "@shared/types";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  KeyRound,
  RefreshCw,
  RotateCcw,
  Sparkles,
  UserPlus,
} from "lucide-react";
import type React from "react";
import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  type AuthUser,
  getAuthBootstrapStatus,
  setupFirstAdmin,
} from "@/client/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { rememberAuthUser } from "../lib/remembered-auth-users";
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

function getPanelStepLabel(panel: OnboardingPanelId): string {
  switch (panel) {
    case "account":
      return "Step 1 of 4";
    case "model":
      return "Step 2 of 4";
    case "resume":
      return "Step 3 of 4";
    case "first-run":
      return "Step 4 of 4";
  }
}

export const OnboardingPage: React.FC = () => {
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [bootstrapState, setBootstrapState] = useState<
    | { status: "checking" }
    | { status: "account_required" }
    | { status: "launch" }
    | { status: "error"; message: string }
  >({ status: "checking" });

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
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coachReplayNonce, setCoachReplayNonce] = useState(0);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      setErrorMessage("Enter both username and password.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const user = await setupFirstAdmin({
        username: normalizedUsername,
        password,
        displayName: displayName.trim() || normalizedUsername,
      });
      onAccountCreated(user);
    } catch (error) {
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
          activePanel="account"
          onPanelChange={() => undefined}
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
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-md bg-muted/40 px-2 py-2.5 text-left transition-colors"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-primary/70 bg-transparent text-primary">
                      <UserPlus className="h-4 w-4" />
                    </span>
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                      <span className="block text-sm font-medium">Account</span>
                      <span className="block text-xs leading-5 text-muted-foreground">
                        Workspace
                      </span>
                    </span>
                  </button>
                  {[
                    ["Model", "Connection"],
                    ["Resume", "Source"],
                    ["First run", "Launch"],
                  ].map(([label, subtitle]) => (
                    <div
                      key={label}
                      className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left text-muted-foreground"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border/60 bg-muted/40">
                        <Circle className="h-3 w-3" />
                      </span>
                      <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                        <span className="block text-sm font-medium">
                          {label}
                        </span>
                        <span className="block text-xs leading-5">
                          {subtitle}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                onClick={() => setCoachReplayNonce((value) => value + 1)}
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
                  <span>{getPanelStepLabel("account")}</span>
                </div>
                <div className="space-y-1.5">
                  <CardTitle className="text-2xl leading-tight">
                    Create your workspace account
                  </CardTitle>
                  <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                    This account owns the first private Job Ops workspace and
                    can manage users later from Settings.
                  </p>
                </div>
              </CardHeader>

              <CardContent
                className="flex flex-1 flex-col gap-5 px-6 pt-5"
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
                    onChange={(event) => setPassword(event.currentTarget.value)}
                    placeholder="At least 8 characters"
                    disabled={isBusy}
                  />
                </div>
                {errorMessage ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errorMessage}
                  </p>
                ) : null}
              </CardContent>

              <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <KeyRound className="h-4 w-4" />
                  Passwords stay in this Job Ops instance.
                </div>
                <Button
                  type="submit"
                  disabled={isBusy}
                  data-onboarding-target="primary-action"
                >
                  {isBusy ? "Creating account..." : "Create account"}
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
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState<OnboardingPanelId>("model");
  const [coachReplayNonce, setCoachReplayNonce] = useState(0);
  const searchTermsAttemptedRef = useRef(false);

  const modelRequirement = useMemo(
    () => getRequirement(onboarding.requirements, "model"),
    [onboarding.requirements],
  );
  const resumeRequirement = useMemo(
    () => getRequirement(onboarding.requirements, "resume"),
    [onboarding.requirements],
  );
  const activeRequirement =
    activePanel === "account" || activePanel === "first-run"
      ? null
      : getRequirement(onboarding.requirements, activePanel);

  useEffect(() => {
    if (onboarding.nextRequirementId) {
      setActivePanel(onboarding.nextRequirementId);
      return;
    }
    if (onboarding.complete) {
      setActivePanel("first-run");
    }
  }, [onboarding.complete, onboarding.nextRequirementId]);

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
    void flow.ensureSearchTerms();
  }, [
    activePanel,
    flow.demoMode,
    flow.ensureSearchTerms,
    flow.hasSavedSearchTerms,
    flow.isGeneratingSearchTerms,
    flow.settingsLoading,
    onboarding.complete,
  ]);

  if (flow.demoMode) {
    return <Navigate to="/jobs/ready" replace />;
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
    onboarding.requirements.filter(
      (requirement) => requirement.status === "ready",
    ).length +
    1 +
    (onboarding.complete ? 1 : 0);

  const submitActivePanel = async () => {
    if (activePanel === "account") {
      setActivePanel(onboarding.nextRequirementId ?? "model");
      return;
    }
    if (activePanel === "model") {
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
      const ready = await flow.ensureSearchTerms();
      if (!ready) return;
    }
    navigate("/jobs/ready", { replace: true });
  };

  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Launch Console"
        subtitle="Load the LLM and resume Job Ops needs before it can work your search."
      />

      <PageMain className="space-y-4">
        <OnboardingCoach
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          replayNonce={coachReplayNonce}
          status={onboarding.status}
        />

        <div className="grid gap-4 lg:grid-cols-[248px_minmax(0,1fr)]">
          <Card className="border-border/60 bg-card shadow-none">
            <CardHeader className="space-y-1.5 pb-4">
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">Launch checks</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {completedCount}/{TOTAL_ONBOARDING_STEPS}
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
                requirements={onboarding.requirements}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground"
                onClick={() => setCoachReplayNonce((value) => value + 1)}
              >
                <RotateCcw className="h-4 w-4" />
                Replay guide
              </Button>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card shadow-none">
            {onboarding.checking || flow.settingsLoading ? (
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
                    <span>{getPanelStepLabel(activePanel)}</span>
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
                          ? "Your model and resume are loaded. Job Ops can start turning job leads into ranked, actionable work."
                          : activeRequirement?.status === "ready"
                            ? activeRequirement.message
                            : "Complete this setup check to unlock the next part of your job-search workflow."}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-5 px-6 pt-5">
                  {activePanel !== "account" ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Workspace account created</span>
                    </div>
                  ) : null}

                  {modelRequirement?.status === "ready" &&
                  activePanel !== "model" ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{modelRequirement.title}</span>
                    </div>
                  ) : null}

                  {resumeRequirement?.status === "ready" &&
                  activePanel !== "resume" ? (
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
                      onLlmApiKeyChange={(value) =>
                        flow.setValue("llmApiKey", value, {
                          shouldDirty: true,
                        })
                      }
                      onLlmBaseUrlChange={(value) =>
                        flow.setValue("llmBaseUrl", value, {
                          shouldDirty: true,
                        })
                      }
                      onLlmModelChange={(value) =>
                        flow.setValue("model", value, { shouldDirty: true })
                      }
                      onLlmProviderChange={(value) =>
                        flow.setValue("llmProvider", value, {
                          shouldDirty: true,
                        })
                      }
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
                              void flow.ensureSearchTerms({ force: true })
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
