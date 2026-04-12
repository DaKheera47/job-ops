import { PageHeader, PageMain } from "@client/components/layout";
import { useOnboardingRequirement } from "@client/hooks/useOnboardingRequirement";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import type React from "react";
import { Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OnboardingStepContent } from "./onboarding/components/OnboardingStepContent";
import { OnboardingStepRail } from "./onboarding/components/OnboardingStepRail";
import { useOnboardingFlow } from "./onboarding/useOnboardingFlow";

export const OnboardingPage: React.FC = () => {
  const flow = useOnboardingFlow();
  const onboardingRequirement = useOnboardingRequirement();

  if (flow.demoMode) {
    return <Navigate to="/jobs/ready" replace />;
  }

  if (!onboardingRequirement.checking && onboardingRequirement.complete) {
    return <Navigate to="/jobs/ready" replace />;
  }

  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Onboarding"
        subtitle="Connect your workspace before the pipeline starts running."
      />

      <PageMain className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="border-border/60 bg-card/40 shadow-none">
            <CardHeader className="space-y-3">
              <CardTitle>Getting started</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <OnboardingStepRail
                currentStep={flow.currentStep}
                onStepSelect={flow.setCurrentStep}
                progressValue={flow.progressValue}
                steps={flow.steps}
              />
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/40 shadow-none">
            {flow.settingsLoading || !flow.currentStep ? (
              <CardContent className="flex min-h-[24rem] items-center justify-center text-sm text-muted-foreground">
                Loading onboarding...
              </CardContent>
            ) : (
              <form
                className="flex min-h-[32rem] flex-col"
                onSubmit={(event) => {
                  event.preventDefault();
                  void flow.handlePrimaryAction();
                }}
              >
                <CardHeader className="space-y-4 border-b border-border/60">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <Badge variant="secondary">
                      {flow.currentCopy.eyebrow}
                    </Badge>
                    <span>
                      {flow.steps.filter((step) => step.complete).length} of{" "}
                      {flow.steps.length} complete
                    </span>
                  </div>
                  <div className="space-y-2">
                    <CardTitle className="text-2xl leading-tight sm:text-3xl">
                      {flow.currentCopy.title}
                    </CardTitle>
                    <CardDescription className="max-w-2xl leading-6">
                      {flow.currentCopy.description}
                    </CardDescription>
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col gap-6 pt-6">
                  <OnboardingStepContent
                    baseResumeValidation={flow.baseResumeValidation}
                    baseResumeValue={flow.baseResumeValue}
                    basicAuthChoice={flow.basicAuthChoice}
                    basicAuthPassword={flow.watch("basicAuthPassword")}
                    basicAuthUser={flow.watch("basicAuthUser")}
                    control={flow.control}
                    currentStep={flow.currentStep}
                    hasSavedSearchTermsInSession={
                      flow.hasSavedSearchTermsInSession
                    }
                    isBusy={flow.isBusy}
                    isGeneratingSearchTerms={flow.isGeneratingSearchTerms}
                    isImportingResume={flow.isImportingResume}
                    isResumeReady={flow.baseResumeValidation.valid}
                    isRxResumeSelfHosted={flow.isRxResumeSelfHosted}
                    llmKeyHint={flow.llmKeyHint}
                    llmValidation={flow.llmValidation}
                    resumeSetupMode={flow.resumeSetupMode}
                    rxresumeApiKey={flow.watch("rxresumeApiKey")}
                    rxresumeApiKeyHint={flow.settings?.rxresumeApiKeyHint}
                    rxresumeUrl={flow.watch("rxresumeUrl")}
                    rxresumeValidation={flow.rxresumeValidation}
                    searchTermDraft={flow.watch("searchTermDraft")}
                    searchTerms={flow.watch("searchTerms")}
                    searchTermsSource={flow.searchTermsSource}
                    searchTermsStale={flow.searchTermsStale}
                    selectedProvider={flow.selectedProvider}
                    onBasicAuthChoiceChange={flow.setBasicAuthChoice}
                    onBasicAuthPasswordChange={(value) =>
                      flow.setValue("basicAuthPassword", value)
                    }
                    onBasicAuthUserChange={(value) =>
                      flow.setValue("basicAuthUser", value)
                    }
                    onImportResumeFile={flow.handleImportResumeFile}
                    onRegenerateSearchTerms={flow.handleRegenerateSearchTerms}
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
                    onSearchTermDraftChange={(value) =>
                      flow.setValue("searchTermDraft", value)
                    }
                    onSearchTermsChange={(values) =>
                      flow.setValue("searchTerms", values, {
                        shouldDirty: true,
                      })
                    }
                    onTemplateResumeChange={flow.handleTemplateResumeChange}
                  />
                </CardContent>

                <div className="flex flex-col gap-3 border-t border-border/60 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={flow.handleBack}
                    disabled={!flow.canGoBack || flow.isBusy}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>

                  <div className="flex flex-col items-start gap-2 sm:items-end">
                    <Button type="submit" disabled={flow.isBusy}>
                      {flow.primaryLabel}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </form>
            )}
          </Card>
        </div>
      </PageMain>
    </>
  );
};
