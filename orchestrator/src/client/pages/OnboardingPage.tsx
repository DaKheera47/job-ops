import { PageHeader, PageMain } from "@client/components/layout";
import { useOnboardingStatus } from "@client/hooks/useOnboardingStatus";
import type {
  OnboardingRequirement,
  OnboardingRequirementPrimaryAction,
} from "@shared/types";
import {
  ArrowRight,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingCoach } from "./onboarding/components/OnboardingCoach";
import { OnboardingStepContent } from "./onboarding/components/OnboardingStepContent";
import { OnboardingStepRail } from "./onboarding/components/OnboardingStepRail";
import type {
  OnboardingPanelId,
  StepId,
  ValidationState,
} from "./onboarding/types";
import { useOnboardingFlow } from "./onboarding/useOnboardingFlow";

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

export const OnboardingPage: React.FC = () => {
  const flow = useOnboardingFlow();
  const onboarding = useOnboardingStatus();
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState<OnboardingPanelId>("model");
  const [coachReplayNonce, setCoachReplayNonce] = useState(0);

  const modelRequirement = useMemo(
    () => getRequirement(onboarding.requirements, "model"),
    [onboarding.requirements],
  );
  const resumeRequirement = useMemo(
    () => getRequirement(onboarding.requirements, "resume"),
    [onboarding.requirements],
  );
  const activeRequirement =
    activePanel === "first-run"
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

  if (flow.demoMode) {
    return <Navigate to="/jobs/ready" replace />;
  }

  if (!onboarding.checking && onboarding.complete) {
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
  const completedCount = onboarding.requirements.filter(
    (requirement) => requirement.status === "ready",
  ).length;

  const submitActivePanel = async () => {
    if (activePanel === "model") {
      const status = await flow.handleSaveModel();
      if (status?.complete) navigate("/jobs/ready", { replace: true });
      return;
    }
    if (activePanel === "resume") {
      if (flow.resumeSetupMode === "rxresume") {
        const status = await flow.handleSaveRxresume();
        if (status?.complete) navigate("/jobs/ready", { replace: true });
        return;
      }
      await onboarding.refetch();
      return;
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
                  {completedCount}/{onboarding.requirements.length || 2}
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
                    <span>
                      {activePanel === "first-run"
                        ? "Ready"
                        : `Step ${activePanel === "model" ? 1 : 2} of 2`}
                    </span>
                    {activeRequirement?.status === "ready" ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Complete
                      </span>
                    ) : null}
                  </div>
                  <div className="space-y-1.5">
                    <CardTitle className="text-2xl leading-tight">
                      {activePanel === "first-run"
                        ? "Ready for the first run"
                        : activeRequirement?.title}
                    </CardTitle>
                    <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      {activePanel === "first-run"
                        ? "Your model and resume are loaded. Job Ops can start turning job leads into ranked, actionable work."
                        : activeRequirement?.status === "ready"
                          ? activeRequirement.message
                          : "Complete this setup check to unlock the next part of your job-search workflow."}
                    </p>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-5 px-6 pt-5">
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

                  {activePanel === "model" || activePanel === "resume" ? (
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
                          Job Ops will prepare search terms from your resume
                          automatically, then open the ready queue where jobs
                          can be scored, matched, tailored, and worked through.
                          You can still tune advanced search controls later from
                          the run modal or Settings.
                        </p>
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
                      (activePanel === "first-run" && !onboarding.complete)
                    }
                    data-onboarding-target="primary-action"
                  >
                    {activePanel === "first-run"
                      ? "Open ready queue"
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
