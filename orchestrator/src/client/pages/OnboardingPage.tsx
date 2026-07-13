import { PageHeader, PageMain } from "@client/components/layout";
import { useDesignResume } from "@client/hooks/useDesignResume";
import { useOnboardingStatus } from "@client/hooks/useOnboardingStatus";
import type {
  OnboardingRequirement,
  OnboardingRequirementId,
  OnboardingStatusResponse,
  ResumeProfile,
} from "@shared/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  Eye,
  EyeOff,
  FileCheck2,
  MapPin,
  RefreshCw,
  Sparkles,
  UserPlus,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import * as api from "@/client/api";
import { queryKeys } from "@/client/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { showErrorToast } from "../lib/error-toast";
import { BaseResumeStep } from "./onboarding/components/BaseResumeStep";
import { LlmConnectionStep } from "./onboarding/components/LlmConnectionStep";
import type { ValidationState } from "./onboarding/types";
import { useOnboardingFlow } from "./onboarding/useOnboardingFlow";

const STEP_ORDER: OnboardingRequirementId[] = ["profile", "model", "resume"];

function getRequirement(
  status: OnboardingStatusResponse | null,
  id: OnboardingRequirementId,
): OnboardingRequirement | null {
  return status?.requirements.find((item) => item.id === id) ?? null;
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

function stepTitle(id: OnboardingRequirementId): string {
  if (id === "profile") return "Your search";
  if (id === "model") return "AI connection";
  return "Your resume";
}

export const OnboardingPage: React.FC = () => {
  const [bootstrapState, setBootstrapState] = useState<
    "checking" | "account" | "launch" | "error"
  >("checking");

  useEffect(() => {
    let cancelled = false;
    void api
      .getAuthBootstrapStatus()
      .then((status) => {
        if (!cancelled)
          setBootstrapState(status.setupRequired ? "account" : "launch");
      })
      .catch(() => {
        if (!cancelled) setBootstrapState("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (bootstrapState === "checking") {
    return <LoadingState message="Preparing your workspace…" />;
  }
  if (bootstrapState === "error") {
    return (
      <LoadingState message="Job Ops could not check the workspace setup. Refresh the page to try again." />
    );
  }
  if (bootstrapState === "account") {
    return <AccountSetup onComplete={() => setBootstrapState("launch")} />;
  }
  return <LaunchSetup />;
};

function LoadingState({ message }: { message: string }) {
  return (
    <>
      <PageHeader icon={Sparkles} title="Set up Job Ops" subtitle={message} />
      <PageMain>
        <Card className="border-border/60 shadow-none">
          <CardContent className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">
            {message}
          </CardContent>
        </Card>
      </PageMain>
    </>
  );
}

function AccountSetup({ onComplete }: { onComplete: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setBusy(true);
      await api.setupFirstAdmin({
        username: username.trim(),
        password,
        displayName: username.trim(),
      });
      onComplete();
    } catch (error) {
      showErrorToast(error, "Could not create the workspace account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={UserPlus}
        title="Create your workspace account"
        subtitle="This private account owns your Job Ops workspace."
      />
      <PageMain>
        <Card className="mx-auto max-w-2xl border-border/60 shadow-none">
          <CardContent className="p-6 sm:p-8">
            <form className="space-y-5" onSubmit={submit}>
              <div className="space-y-5">
                <Field label="Username">
                  <Input
                    aria-label="Username"
                    autoComplete="username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                  />
                </Field>
                <Field label="Password">
                  <div className="relative">
                    <Input
                      aria-label="Password"
                      autoComplete="new-password"
                      className="pr-10"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      aria-label={
                        showPassword ? "Hide password" : "Show password"
                      }
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>
                  {busy ? "Creating account…" : "Create account"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </PageMain>
    </>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function LaunchSetup() {
  const queryClient = useQueryClient();
  const onboarding = useOnboardingStatus();
  const flow = useOnboardingFlow();
  const designResume = useDesignResume();
  const appStatus = useQuery({
    queryKey: queryKeys.app.status(),
    queryFn: api.getAppStatus,
  });
  const profileQuery = useQuery<ResumeProfile>({
    queryKey: queryKeys.profile.current(),
    queryFn: api.getProfile,
    enabled: Boolean(
      designResume.status?.exists ||
        getRequirement(onboarding.status, "resume")?.details?.resumeId,
    ),
    retry: false,
  });
  const [selectedStep, setSelectedStep] =
    useState<OnboardingRequirementId | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [country, setCountry] = useState("");
  const [cities, setCities] = useState("");
  const [workplaceTypes, setWorkplaceTypes] = useState<
    Array<"remote" | "hybrid" | "onsite">
  >(["remote", "hybrid"]);
  const [requiresVisaSponsorship, setRequiresVisaSponsorship] = useState(false);

  const showModel =
    appStatus.data?.capabilities.userEditableLlmSettings ?? true;
  const visibleSteps = showModel
    ? STEP_ORDER
    : STEP_ORDER.filter((step) => step !== "model");
  const status = onboarding.status;
  const activeStep = selectedStep ?? status?.nextRequirementId ?? "profile";

  const applyStatus = (next: OnboardingStatusResponse) => {
    queryClient.setQueryData(queryKeys.onboarding.status(), next);
    setSelectedStep(next.nextRequirementId);
  };

  if (flow.demoMode || status?.complete) {
    return <Navigate to="/jobs/ready" replace />;
  }
  if (onboarding.checking || appStatus.isLoading) {
    return <LoadingState message="Loading your setup…" />;
  }

  const modelRequirement = getRequirement(status, "model");
  const resumeRequirement = getRequirement(status, "resume");
  const resumeSource =
    typeof resumeRequirement?.details?.confirmationSource === "string"
      ? resumeRequirement.details.confirmationSource
      : designResume.document?.id
        ? `local:${designResume.document.id}`
        : null;

  const saveProfile = async () => {
    const parsedCities = cities
      .split(/[\n,]/)
      .map((city) => city.trim())
      .filter(Boolean);
    try {
      setProfileBusy(true);
      applyStatus(
        await api.saveOnboardingProfile({
          country: country.trim() || null,
          cities: parsedCities,
          workplaceTypes,
          requiresVisaSponsorship,
        }),
      );
    } catch (error) {
      showErrorToast(error, "Could not save search preferences");
    } finally {
      setProfileBusy(false);
    }
  };

  const saveModel = async () => {
    const next = await flow.handleSaveModel();
    if (next) applyStatus(next);
  };

  const confirmResume = async () => {
    if (!resumeSource) return;
    try {
      setConfirmBusy(true);
      applyStatus(await api.confirmOnboardingResume(resumeSource));
    } catch (error) {
      showErrorToast(error, "Could not confirm this resume");
    } finally {
      setConfirmBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        icon={Sparkles}
        title="Set up Job Ops"
        subtitle="Three focused choices, then you’re in. Search terms wait until your first run."
      />
      <PageMain>
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav className="space-y-2" aria-label="Setup progress">
            {visibleSteps.map((step, index) => {
              const requirement = getRequirement(status, step);
              const complete = requirement?.status === "ready";
              const selected = step === activeStep;
              return (
                <button
                  key={step}
                  type="button"
                  onClick={() => {
                    if (complete || step === status?.nextRequirementId)
                      setSelectedStep(step);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors",
                    selected
                      ? "bg-foreground text-background"
                      : complete
                        ? "hover:bg-muted"
                        : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full border text-xs",
                      selected && "border-background/30",
                    )}
                  >
                    {complete ? <Check className="h-4 w-4" /> : index + 1}
                  </span>
                  <span>
                    <span className="block text-sm font-medium">
                      {stepTitle(step)}
                    </span>
                    <span
                      className={cn(
                        "block text-xs",
                        selected
                          ? "text-background/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {complete
                        ? "Complete"
                        : step === status?.nextRequirementId
                          ? "Up next"
                          : "Locked"}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <Card className="min-w-0 border-border/60 shadow-none">
            <CardContent className="p-6 sm:p-8">
              {activeStep === "profile" ? (
                <ProfileStep
                  country={country}
                  cities={cities}
                  workplaceTypes={workplaceTypes}
                  requiresVisaSponsorship={requiresVisaSponsorship}
                  busy={profileBusy}
                  onCountryChange={setCountry}
                  onCitiesChange={setCities}
                  onWorkplaceTypesChange={setWorkplaceTypes}
                  onVisaChange={setRequiresVisaSponsorship}
                  onContinue={saveProfile}
                />
              ) : activeStep === "model" ? (
                <StepShell
                  eyebrow="AI connection"
                  title="Choose how Job Ops should think"
                  description="Pick a provider first. Job Ops saves the configuration only after the server verifies the connection."
                >
                  <LlmConnectionStep
                    apiKey={flow.watch("llmApiKey")}
                    baseUrl={flow.watch("llmBaseUrl")}
                    defaultModel={flow.settings?.model.default}
                    effectiveModel={flow.settings?.model.value}
                    isBusy={flow.isBusy}
                    llmKeyHint={flow.llmKeyHint}
                    model={flow.watch("model")}
                    savedBaseUrl={flow.settings?.llmBaseUrl.value}
                    savedProvider={flow.settings?.llmProvider.value}
                    selectedProvider={flow.selectedProvider}
                    validation={toValidationState(modelRequirement)}
                    onCodexAuthStatusChange={(codexStatus) => {
                      if (codexStatus.authenticated) return;
                      setSelectedStep("model");
                      void onboarding.refetch();
                    }}
                    onApiKeyChange={(value) =>
                      flow.setValue("llmApiKey", value)
                    }
                    onBaseUrlChange={(value) =>
                      flow.setValue("llmBaseUrl", value)
                    }
                    onModelChange={(value) => flow.setValue("model", value)}
                    onProviderChange={(value) =>
                      flow.setValue("llmProvider", value)
                    }
                  />
                  <StepActions
                    onBack={() => setSelectedStep("profile")}
                    onContinue={saveModel}
                    busy={flow.isBusy}
                    label="Connect and continue"
                  />
                </StepShell>
              ) : (
                <ResumeStep
                  flow={flow}
                  requirement={resumeRequirement}
                  profile={profileQuery.data ?? null}
                  hasResume={Boolean(resumeSource)}
                  busy={confirmBusy}
                  onBack={() =>
                    setSelectedStep(showModel ? "model" : "profile")
                  }
                  onConfirm={confirmResume}
                  onRefresh={() => void profileQuery.refetch()}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </PageMain>
    </>
  );
}

function StepShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {description}
        </p>
      </div>
      {children}
    </div>
  );
}

function StepActions({
  onBack,
  onContinue,
  busy,
  label,
}: {
  onBack?: () => void;
  onContinue: () => void | Promise<void>;
  busy: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between border-t pt-6">
      {onBack ? (
        <Button type="button" variant="ghost" onClick={onBack} disabled={busy}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button type="button" onClick={() => void onContinue()} disabled={busy}>
        {busy ? "Saving…" : label}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

function ProfileStep(props: {
  country: string;
  cities: string;
  workplaceTypes: Array<"remote" | "hybrid" | "onsite">;
  requiresVisaSponsorship: boolean;
  busy: boolean;
  onCountryChange: (value: string) => void;
  onCitiesChange: (value: string) => void;
  onWorkplaceTypesChange: (
    value: Array<"remote" | "hybrid" | "onsite">,
  ) => void;
  onVisaChange: (value: boolean) => void;
  onContinue: () => void;
}) {
  const toggle = (value: "remote" | "hybrid" | "onsite") =>
    props.onWorkplaceTypesChange(
      props.workplaceTypes.includes(value)
        ? props.workplaceTypes.filter((item) => item !== value)
        : [...props.workplaceTypes, value],
    );
  return (
    <StepShell
      eyebrow="Your search"
      title="Where do you want to work?"
      description="These preferences seed new runs and help Job Ops prioritize location-aware and visa-sponsor sources. You can change them later."
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Country or market">
          <Input
            value={props.country}
            onChange={(event) => props.onCountryChange(event.target.value)}
            placeholder="United Kingdom"
          />
        </Field>
        <Field label="Preferred cities or regions (optional)">
          <Input
            value={props.cities}
            onChange={(event) => props.onCitiesChange(event.target.value)}
            placeholder="London, Manchester"
          />
        </Field>
      </div>
      <div className="space-y-3">
        <Label>Workplace style</Label>
        <div className="grid gap-3 sm:grid-cols-3">
          {(["remote", "hybrid", "onsite"] as const).map((value) => (
            <Label
              key={value}
              htmlFor={`workplace-${value}`}
              className="flex cursor-pointer items-center gap-3 rounded-xl border border-border/60 p-4 capitalize"
            >
              <Checkbox
                id={`workplace-${value}`}
                checked={props.workplaceTypes.includes(value)}
                onCheckedChange={() => toggle(value)}
              />
              {value}
            </Label>
          ))}
        </div>
      </div>
      <Label
        htmlFor="visa-sponsorship"
        className="flex cursor-pointer items-start gap-3 rounded-xl bg-muted/40 p-4"
      >
        <Checkbox
          id="visa-sponsorship"
          checked={props.requiresVisaSponsorship}
          onCheckedChange={(value) => props.onVisaChange(value === true)}
        />
        <span>
          <span className="block text-sm font-medium">
            I need employer visa sponsorship
          </span>
          <span className="block text-sm text-muted-foreground">
            Job Ops will show sponsor information and favor sponsor-aware
            sources when available.
          </span>
        </span>
      </Label>
      <StepActions
        onContinue={props.onContinue}
        busy={props.busy || props.workplaceTypes.length === 0}
        label="Save and continue"
      />
    </StepShell>
  );
}

function ResumeStep({
  flow,
  requirement,
  profile,
  hasResume,
  busy,
  onBack,
  onConfirm,
  onRefresh,
}: {
  flow: ReturnType<typeof useOnboardingFlow>;
  requirement: OnboardingRequirement | null;
  profile: ResumeProfile | null;
  hasResume: boolean;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
  onRefresh: () => void;
}) {
  const experience = profile?.sections?.experience?.items ?? [];
  if (!hasResume) {
    return (
      <StepShell
        eyebrow="Your resume"
        title="Load the resume Job Ops should use"
        description="Upload a file or connect Reactive Resume. After parsing, you’ll review the result before anything is marked complete."
      >
        <BaseResumeStep
          allowReactiveResume
          baseResumeValidation={toValidationState(requirement)}
          baseResumeValue={flow.watch("rxresumeBaseResumeId")}
          hasRxResumeAccess={Boolean(flow.rxresumeApiKeyHint)}
          importingResumeFileName={flow.importingResumeFileName}
          isBusy={flow.isBusy}
          isImportingResume={flow.isImportingResume}
          isResumeReady={false}
          isRxResumeSelfHosted={flow.isRxResumeSelfHosted}
          resumeSetupMode={flow.resumeSetupMode}
          rxresumeApiKey={flow.watch("rxresumeApiKey")}
          rxresumeApiKeyHint={flow.rxresumeApiKeyHint}
          rxresumeUrl={flow.watch("rxresumeUrl")}
          rxresumeValidation={toValidationState(requirement)}
          selectedProvider={flow.selectedProvider}
          onImportResumeFile={flow.handleImportResumeFile}
          onResumeSetupModeChange={flow.setResumeSetupMode}
          onRxresumeApiKeyChange={(value) =>
            flow.setValue("rxresumeApiKey", value)
          }
          onRxresumeSelfHostedChange={flow.handleRxresumeSelfHostedChange}
          onRxresumeUrlChange={(value) => flow.setValue("rxresumeUrl", value)}
          onTemplateResumeChange={flow.handleTemplateResumeChange}
        />
        <div className="border-t pt-6">
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>
      </StepShell>
    );
  }
  return (
    <StepShell
      eyebrow="Resume review"
      title="Is this the right resume?"
      description="Confirm the parsed identity and recent experience. Completion is tied to this exact resume source, so replacing it requires confirmation again."
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="min-h-80 rounded-xl border border-border/60 bg-muted/15 p-6">
          <div className="mb-6 border-b pb-5">
            <h3 className="text-2xl font-semibold">
              {profile?.basics?.name || "Parsed resume"}
            </h3>
            <p className="text-muted-foreground">
              {profile?.basics?.headline ||
                profile?.basics?.label ||
                "Review the imported details"}
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4" />
              {profile?.basics?.location?.city ||
                profile?.basics?.location?.region ||
                "No location detected"}
            </p>
          </div>
          <div className="space-y-4">
            {experience.slice(0, 4).map((item) => (
              <div key={item.id} className="grid gap-1 sm:grid-cols-[1fr_auto]">
                <div>
                  <div className="font-medium">{item.position}</div>
                  <div className="text-sm text-muted-foreground">
                    {item.company}
                    {item.location ? ` · ${item.location}` : ""}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">{item.date}</div>
              </div>
            ))}
            {experience.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No experience entries were detected. Open Resume Studio to
                correct the document before confirming.
              </p>
            ) : null}
          </div>
        </div>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted/40 p-4">
            <FileCheck2 className="mb-3 h-5 w-5" />
            <div className="text-sm font-medium">Parsed successfully</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {experience.length} experience{" "}
              {experience.length === 1 ? "entry" : "entries"}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={onRefresh}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh preview
          </Button>
          <Button type="button" variant="outline" className="w-full" asChild>
            <a href="/resume/design">
              <BriefcaseBusiness className="h-4 w-4" />
              Edit in Resume Studio
            </a>
          </Button>
        </div>
      </div>
      <StepActions
        onBack={onBack}
        onContinue={onConfirm}
        busy={busy}
        label="Use this resume"
      />
    </StepShell>
  );
}
