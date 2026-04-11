import { PageHeader, PageMain } from "@client/components/layout";
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

  if (flow.demoMode) {
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
        <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <Card className="border-border/60 bg-card/40 shadow-none">
            <CardHeader className="space-y-3">
              <CardTitle>Let&apos;s get you a job</CardTitle>
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
                    basicAuthChoice={flow.basicAuthChoice}
                    basicAuthPassword={flow.watch("basicAuthPassword")}
                    basicAuthUser={flow.watch("basicAuthUser")}
                    control={flow.control}
                    currentStep={flow.currentStep}
                    isBusy={flow.isBusy}
                    isRxResumeSelfHosted={flow.isRxResumeSelfHosted}
                    llmKeyHint={flow.llmKeyHint}
                    llmValidation={flow.llmValidation}
                    pdfRenderer={flow.watch("pdfRenderer")}
                    rxresumeApiKey={flow.watch("rxresumeApiKey")}
                    rxresumeApiKeyHint={flow.settings?.rxresumeApiKeyHint}
                    rxresumeUrl={flow.watch("rxresumeUrl")}
                    rxresumeValidation={flow.rxresumeValidation}
                    selectedProvider={flow.selectedProvider}
                    templateResumeId={flow.watch("rxresumeBaseResumeId")}
                    onBasicAuthChoiceChange={flow.setBasicAuthChoice}
                    onBasicAuthPasswordChange={(value) =>
                      flow.setValue("basicAuthPassword", value)
                    }
                    onBasicAuthUserChange={(value) =>
                      flow.setValue("basicAuthUser", value)
                    }
                    onPdfRendererChange={(renderer) =>
                      flow.setValue("pdfRenderer", renderer)
                    }
                    onRxresumeApiKeyChange={(value) =>
                      flow.setValue("rxresumeApiKey", value)
                    }
                    onRxresumeSelfHostedChange={
                      flow.handleRxresumeSelfHostedChange
                    }
                    onRxresumeUrlChange={(value) =>
                      flow.setValue("rxresumeUrl", value)
                    }
                    onTemplateResumeChange={(value) => {
                      flow.setBaseResumeId(value);
                      flow.setValue("rxresumeBaseResumeId", value);
                    }}
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
                    <p className="text-sm text-muted-foreground">
                      {flow.currentStep === "basicauth"
                        ? "Finish by enabling basic auth or explicitly skipping it for now."
                        : null}
                    </p>
                    <Button
                      type="submit"
                      disabled={
                        flow.isBusy ||
                        (flow.currentStep === "baseresume" &&
                          !flow.rxresumeValidation.valid)
                      }
                    >
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
