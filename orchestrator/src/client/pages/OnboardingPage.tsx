import * as api from "@client/api";
import { ReactiveResumeConfigPanel } from "@client/components/ReactiveResumeConfigPanel";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useRxResumeConfigState } from "@client/hooks/useRxResumeConfigState";
import { useSettings } from "@client/hooks/useSettings";
import {
  readBasicAuthDecision,
  writeBasicAuthDecision,
} from "@client/lib/onboarding";
import { queryKeys } from "@client/lib/queryKeys";
import {
  getRxResumeCredentialDrafts,
  getRxResumeMissingCredentialLabels,
  validateAndMaybePersistRxResumeMode,
} from "@client/lib/rxresume-config";
import { BaseResumeSelection } from "@client/pages/settings/components/BaseResumeSelection";
import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import {
  getLlmProviderConfig,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDERS,
  normalizeLlmProvider,
} from "@client/pages/settings/utils";
import { getDefaultModelForProvider } from "@shared/settings-registry";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type {
  AppSettings,
  PdfRenderer,
  ValidationResult,
} from "@shared/types.js";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  KeyRound,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type ValidationState = ValidationResult & { checked: boolean };

type OnboardingFormData = {
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  pdfRenderer: PdfRenderer;
  rxresumeUrl: string;
  rxresumeApiKey: string;
  rxresumeBaseResumeId: string | null;
  basicAuthUser: string;
  basicAuthPassword: string;
};

type StepId = "llm" | "rxresume" | "baseresume" | "basicauth";
type BasicAuthChoice = "enable" | "skip" | null;

const EMPTY_VALIDATION_STATE: ValidationState = {
  valid: false,
  message: null,
  checked: false,
};

const STEP_COPY: Record<
  StepId,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  llm: {
    eyebrow: "Step 1",
    title: "Choose the LLM connection Job Ops should trust.",
    description:
      "Pick the provider, confirm the endpoint, and validate the credentials this workspace will use for scoring and tailoring.",
  },
  rxresume: {
    eyebrow: "Step 2",
    title: "Connect the resume engine that will export tailored PDFs.",
    description:
      "Point Job Ops at your Reactive Resume instance so tailoring can render a final document without extra setup later.",
  },
  baseresume: {
    eyebrow: "Step 3",
    title: "Pick the template resume the pipeline will start from.",
    description:
      "This becomes the source document for tailoring, so choose the version you want every application to inherit from.",
  },
  basicauth: {
    eyebrow: "Step 4",
    title: "Decide whether write actions should be protected.",
    description:
      "You can enable basic auth now for a safer local setup, or explicitly skip it for now and come back later in Settings.",
  },
};

function StepStatusBadge({
  active,
  complete,
  index,
}: {
  active: boolean;
  complete: boolean;
  index: number;
}) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
        complete
          ? "border-emerald-500 bg-emerald-500 text-emerald-950"
          : active
            ? "border-slate-900 bg-slate-900 text-stone-50"
            : "border-stone-300 bg-stone-50 text-stone-500",
      )}
    >
      {complete ? <Check className="h-4 w-4" /> : index + 1}
    </span>
  );
}

function InlineValidation({ state }: { state: ValidationState }) {
  if (!state.checked || state.valid || !state.message) return null;

  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      {state.message}
    </div>
  );
}

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { settings, isLoading: settingsLoading } = useSettings();
  const { storedRxResume, setBaseResumeId, syncBaseResumeId } =
    useRxResumeConfigState(settings);
  const demoInfo = useDemoInfo();
  const demoMode = demoInfo?.demoMode ?? false;

  const [isSaving, setIsSaving] = useState(false);
  const [isValidatingLlm, setIsValidatingLlm] = useState(false);
  const [isValidatingRxresume, setIsValidatingRxresume] = useState(false);
  const [isValidatingBaseResume, setIsValidatingBaseResume] = useState(false);
  const [llmValidation, setLlmValidation] = useState<ValidationState>(
    EMPTY_VALIDATION_STATE,
  );
  const [rxresumeValidation, setRxresumeValidation] = useState<ValidationState>(
    EMPTY_VALIDATION_STATE,
  );
  const [baseResumeValidation, setBaseResumeValidation] =
    useState<ValidationState>(EMPTY_VALIDATION_STATE);
  const [basicAuthDecision, setBasicAuthDecision] = useState(
    readBasicAuthDecision,
  );
  const [basicAuthChoice, setBasicAuthChoice] = useState<BasicAuthChoice>(null);
  const [currentStep, setCurrentStep] = useState<StepId | null>(null);

  const { control, watch, getValues, reset, setValue } =
    useForm<OnboardingFormData>({
      defaultValues: {
        llmProvider: "",
        llmBaseUrl: "",
        llmApiKey: "",
        pdfRenderer: "rxresume",
        rxresumeUrl: "",
        rxresumeApiKey: "",
        rxresumeBaseResumeId: null,
        basicAuthUser: "",
        basicAuthPassword: "",
      },
    });

  const syncSettingsCache = useCallback(
    (nextSettings: AppSettings) => {
      queryClient.setQueryData(queryKeys.settings.current(), nextSettings);
    },
    [queryClient],
  );

  useEffect(() => {
    if (!settings) return;

    const selectedId = syncBaseResumeId();
    reset({
      llmProvider: settings.llmProvider?.value || "",
      llmBaseUrl: settings.llmBaseUrl?.value || "",
      llmApiKey: "",
      pdfRenderer: settings.pdfRenderer?.value ?? "rxresume",
      rxresumeUrl: settings.rxresumeUrl ?? "",
      rxresumeApiKey: "",
      rxresumeBaseResumeId: selectedId,
      basicAuthUser: settings.basicAuthUser ?? "",
      basicAuthPassword: "",
    });
    setBasicAuthDecision(readBasicAuthDecision());
    setBasicAuthChoice(
      settings.basicAuthActive
        ? "enable"
        : readBasicAuthDecision() === "skipped"
          ? "skip"
          : null,
    );
  }, [reset, settings, syncBaseResumeId]);

  const llmProvider = watch("llmProvider");
  const selectedProvider = normalizeLlmProvider(
    llmProvider || settings?.llmProvider?.value || "openrouter",
  );
  const providerConfig = getLlmProviderConfig(selectedProvider);
  const {
    normalizedProvider,
    showApiKey,
    showBaseUrl,
    requiresApiKey: requiresLlmKey,
  } = providerConfig;

  const llmKeyHint = settings?.llmApiKeyHint ?? null;
  const hasLlmKey = Boolean(llmKeyHint);
  const llmValidated = requiresLlmKey ? llmValidation.valid : true;
  const basicAuthComplete = Boolean(
    settings?.basicAuthActive || basicAuthDecision !== null,
  );

  const validateLlm = useCallback(async () => {
    const values = getValues();

    setIsValidatingLlm(true);
    try {
      const result = await api.validateLlm({
        provider: selectedProvider,
        baseUrl: showBaseUrl
          ? values.llmBaseUrl.trim() || undefined
          : undefined,
        apiKey: requiresLlmKey
          ? values.llmApiKey.trim() || undefined
          : undefined,
      });
      setLlmValidation({ ...result, checked: true });
      return result;
    } catch (error) {
      const result = {
        valid: false,
        message:
          error instanceof Error ? error.message : "LLM validation failed",
      };
      setLlmValidation({ ...result, checked: true });
      return result;
    } finally {
      setIsValidatingLlm(false);
    }
  }, [getValues, requiresLlmKey, selectedProvider, showBaseUrl]);

  const validateBaseResume = useCallback(async () => {
    setIsValidatingBaseResume(true);
    try {
      const result = await api.validateResumeConfig();
      setBaseResumeValidation({ ...result, checked: true });
      return result;
    } catch (error) {
      const result = {
        valid: false,
        message:
          error instanceof Error
            ? error.message
            : "Base resume validation failed",
      };
      setBaseResumeValidation({ ...result, checked: true });
      return result;
    } finally {
      setIsValidatingBaseResume(false);
    }
  }, []);

  const validateRxresume = useCallback(async () => {
    setIsValidatingRxresume(true);
    try {
      const result = await validateAndMaybePersistRxResumeMode({
        stored: storedRxResume,
        draft: getRxResumeCredentialDrafts(getValues()),
        validate: api.validateRxresume,
        getPrecheckMessage: () =>
          "v5 API key required. Add a v5 API key, then test again.",
        getValidationErrorMessage: (error: unknown) =>
          error instanceof Error ? error.message : "RxResume validation failed",
      });
      setRxresumeValidation({ ...result.validation, checked: true });
      return result.validation;
    } finally {
      setIsValidatingRxresume(false);
    }
  }, [getValues, storedRxResume]);

  useEffect(() => {
    if (!showBaseUrl) {
      setValue("llmBaseUrl", "");
    }
  }, [setValue, showBaseUrl]);

  useEffect(() => {
    if (!selectedProvider) return;
    setLlmValidation({ valid: false, message: null, checked: false });
  }, [selectedProvider]);

  const runAllValidations = useCallback(async () => {
    if (!settings || demoMode) return;

    const validations: Promise<ValidationResult>[] = [];
    if (requiresLlmKey) {
      validations.push(validateLlm());
    } else {
      setLlmValidation({ valid: true, message: null, checked: true });
    }

    validations.push(validateRxresume(), validateBaseResume());
    await Promise.allSettled(validations);
  }, [
    demoMode,
    requiresLlmKey,
    settings,
    validateBaseResume,
    validateLlm,
    validateRxresume,
  ]);

  useEffect(() => {
    if (demoMode || !settings || settingsLoading) return;

    const needsValidation =
      (requiresLlmKey ? !llmValidation.checked : false) ||
      !rxresumeValidation.checked ||
      !baseResumeValidation.checked;
    if (!needsValidation) return;

    void runAllValidations();
  }, [
    baseResumeValidation.checked,
    demoMode,
    llmValidation.checked,
    requiresLlmKey,
    runAllValidations,
    rxresumeValidation.checked,
    settings,
    settingsLoading,
  ]);

  const steps = useMemo(
    () => [
      {
        id: "llm" as const,
        label: "LLM",
        subtitle: "Provider, credentials, and endpoint",
        complete: llmValidated,
        disabled: false,
      },
      {
        id: "rxresume" as const,
        label: "RxResume",
        subtitle: "Resume export connection",
        complete: rxresumeValidation.valid,
        disabled: false,
      },
      {
        id: "baseresume" as const,
        label: "Template",
        subtitle: "Choose the source resume",
        complete: baseResumeValidation.valid,
        disabled: !rxresumeValidation.valid,
      },
      {
        id: "basicauth" as const,
        label: "Basic auth",
        subtitle: "Protect write actions or skip",
        complete: basicAuthComplete,
        disabled: false,
      },
    ],
    [
      basicAuthComplete,
      baseResumeValidation.valid,
      llmValidated,
      rxresumeValidation.valid,
    ],
  );

  useEffect(() => {
    if (!steps.length) return;

    const firstIncomplete =
      steps.find((step) => !step.complete)?.id ?? steps[0].id;
    setCurrentStep((existing) => {
      if (!existing) return firstIncomplete;
      const existingStep = steps.find((step) => step.id === existing);
      if (!existingStep) return firstIncomplete;
      if (existingStep.complete && existing !== firstIncomplete) {
        return firstIncomplete;
      }
      return existing;
    });
  }, [steps]);

  const progressValue =
    steps.length > 0
      ? Math.round(
          (steps.filter((step) => step.complete).length / steps.length) * 100,
        )
      : 0;

  const complete =
    llmValidated &&
    rxresumeValidation.valid &&
    baseResumeValidation.valid &&
    basicAuthComplete;

  useEffect(() => {
    if (demoMode) {
      navigate("/jobs/ready", { replace: true });
      return;
    }
    if (!settingsLoading && complete) {
      navigate("/jobs/ready", { replace: true });
    }
  }, [complete, demoMode, navigate, settingsLoading]);

  const goToNextStep = useCallback(
    (from: StepId) => {
      const currentIndex = steps.findIndex((step) => step.id === from);
      const nextStep = steps
        .slice(currentIndex + 1)
        .find((step) => !step.disabled)?.id;
      if (nextStep) {
        setCurrentStep(nextStep);
      }
    },
    [steps],
  );

  const handleSaveLlm = useCallback(async () => {
    const values = getValues();
    const apiKeyValue = values.llmApiKey.trim();
    const baseUrlValue = values.llmBaseUrl.trim();

    if (requiresLlmKey && !apiKeyValue && !hasLlmKey) {
      toast.info("Add your LLM API key to continue");
      return false;
    }

    const validation = requiresLlmKey
      ? await validateLlm()
      : { valid: true, message: null };

    if (!validation.valid) {
      toast.error(validation.message || "LLM validation failed");
      return false;
    }

    const update: Partial<UpdateSettingsInput> = {
      llmProvider: normalizedProvider,
      llmBaseUrl: showBaseUrl ? baseUrlValue || null : null,
      model: null,
      modelScorer: null,
      modelTailoring: null,
      modelProjectSelection: null,
    };

    if (showApiKey && apiKeyValue) {
      update.llmApiKey = apiKeyValue;
    }

    try {
      setIsSaving(true);
      const nextSettings = await api.updateSettings(update);
      syncSettingsCache(nextSettings);
      setValue("llmApiKey", "");
      const defaultModel = getDefaultModelForProvider(normalizedProvider);
      toast.success("LLM provider connected", {
        description:
          normalizedProvider === "openai" || normalizedProvider === "gemini"
            ? `Default for ${providerConfig.label}: ${defaultModel}.`
            : "You can fine-tune models later in Settings.",
      });
      goToNextStep("llm");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save LLM settings",
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    getValues,
    goToNextStep,
    hasLlmKey,
    normalizedProvider,
    providerConfig.label,
    requiresLlmKey,
    setValue,
    showApiKey,
    showBaseUrl,
    syncSettingsCache,
    validateLlm,
  ]);

  const handleSaveRxresume = useCallback(async () => {
    const values = getValues();
    const draftCredentials = getRxResumeCredentialDrafts(values);
    const missing = getRxResumeMissingCredentialLabels({
      stored: storedRxResume,
      draft: draftCredentials,
    });

    if (missing.length > 0) {
      toast.info("Almost there", {
        description: `Missing: ${missing.join(", ")}`,
      });
      return false;
    }

    try {
      setIsValidatingRxresume(true);
      const result = await validateAndMaybePersistRxResumeMode({
        stored: storedRxResume,
        draft: draftCredentials,
        validate: api.validateRxresume,
        persist: async (update: Parameters<typeof api.updateSettings>[0]) => {
          setIsSaving(true);
          try {
            const nextSettings = await api.updateSettings({
              ...update,
              pdfRenderer: values.pdfRenderer,
            });
            syncSettingsCache(nextSettings);
          } finally {
            setIsSaving(false);
          }
        },
        persistOnSuccess: true,
        getPrecheckMessage: () =>
          "v5 API key required. Add a v5 API key, then test again.",
        getValidationErrorMessage: (error: unknown) =>
          error instanceof Error ? error.message : "RxResume validation failed",
        getPersistErrorMessage: (error: unknown) =>
          error instanceof Error
            ? error.message
            : "Failed to save RxResume credentials",
      });

      setRxresumeValidation({ ...result.validation, checked: true });
      if (!result.validation.valid) {
        toast.error(result.validation.message || "RxResume validation failed");
        return false;
      }

      setValue("rxresumeApiKey", "");
      toast.success("Reactive Resume connected");
      goToNextStep("rxresume");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save RxResume credentials",
      );
      return false;
    } finally {
      setIsValidatingRxresume(false);
      setIsSaving(false);
    }
  }, [getValues, goToNextStep, setValue, storedRxResume, syncSettingsCache]);

  const handleSaveBaseResume = useCallback(async () => {
    const values = getValues();

    if (!values.rxresumeBaseResumeId) {
      toast.info("Select a template resume to continue");
      return false;
    }

    try {
      setIsSaving(true);
      const nextSettings = await api.updateSettings({
        pdfRenderer: values.pdfRenderer,
        rxresumeBaseResumeId: values.rxresumeBaseResumeId,
      });
      syncSettingsCache(nextSettings);
      const validation = await validateBaseResume();
      if (!validation.valid) {
        toast.error(validation.message || "Base resume validation failed");
        return false;
      }

      toast.success("Template resume locked in");
      goToNextStep("baseresume");
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save base resume",
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [getValues, goToNextStep, syncSettingsCache, validateBaseResume]);

  const handleCompleteBasicAuth = useCallback(async () => {
    if (basicAuthChoice === "skip") {
      writeBasicAuthDecision("skipped");
      setBasicAuthDecision("skipped");
      toast.success("Basic auth skipped for now");
      navigate("/jobs/ready", { replace: true });
      return true;
    }

    if (basicAuthChoice !== "enable") {
      toast.info("Choose whether to enable basic auth or skip it for now");
      return false;
    }

    const { basicAuthUser, basicAuthPassword } = getValues();
    const normalizedUser = basicAuthUser.trim();
    const normalizedPassword = basicAuthPassword.trim();

    if (!normalizedUser || !normalizedPassword) {
      toast.info("Enter both a username and password to enable basic auth");
      return false;
    }

    try {
      setIsSaving(true);
      const nextSettings = await api.updateSettings({
        enableBasicAuth: true,
        basicAuthUser: normalizedUser,
        basicAuthPassword: normalizedPassword,
      });
      syncSettingsCache(nextSettings);
      writeBasicAuthDecision("enabled");
      setBasicAuthDecision("enabled");
      setValue("basicAuthPassword", "");
      toast.success("Basic auth enabled");
      navigate("/jobs/ready", { replace: true });
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save basic auth credentials",
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [basicAuthChoice, getValues, navigate, setValue, syncSettingsCache]);

  const handlePrimaryAction = useCallback(async () => {
    if (!currentStep) return;
    if (currentStep === "llm") {
      await handleSaveLlm();
      return;
    }
    if (currentStep === "rxresume") {
      await handleSaveRxresume();
      return;
    }
    if (currentStep === "baseresume") {
      await handleSaveBaseResume();
      return;
    }
    await handleCompleteBasicAuth();
  }, [
    currentStep,
    handleCompleteBasicAuth,
    handleSaveBaseResume,
    handleSaveLlm,
    handleSaveRxresume,
  ]);

  const stepIndex = currentStep
    ? steps.findIndex((step) => step.id === currentStep)
    : 0;
  const canGoBack = stepIndex > 0;
  const isBusy =
    isSaving ||
    settingsLoading ||
    isValidatingLlm ||
    isValidatingRxresume ||
    isValidatingBaseResume;

  const currentCopy = currentStep ? STEP_COPY[currentStep] : STEP_COPY.llm;

  const primaryLabel =
    currentStep === "llm"
      ? llmValidated
        ? "Revalidate connection"
        : "Save and continue"
      : currentStep === "rxresume"
        ? rxresumeValidation.valid
          ? "Recheck connection"
          : "Save and continue"
        : currentStep === "baseresume"
          ? baseResumeValidation.valid
            ? "Recheck selection"
            : "Save and continue"
          : basicAuthChoice === "enable"
            ? "Enable basic auth"
            : basicAuthChoice === "skip"
              ? "Finish onboarding"
              : "Choose an option";

  if (demoMode) {
    return <Navigate to="/jobs/ready" replace />;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_34%),linear-gradient(135deg,_#f7f3ea_0%,_#f4efe4_48%,_#f0eadc_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-8rem] top-[-5rem] h-64 w-64 rounded-full bg-amber-300/30 blur-3xl" />
        <div className="absolute bottom-[-8rem] right-[-6rem] h-72 w-72 rounded-full bg-orange-200/40 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6 lg:flex-row lg:items-stretch lg:px-10 lg:py-10">
        <aside className="flex w-full flex-col justify-between rounded-[2rem] border border-stone-200/70 bg-stone-50/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur sm:p-8 lg:w-[28rem] lg:p-10">
          <div className="space-y-8">
            <div className="space-y-4">
              <Badge
                variant="outline"
                className="border-stone-300 bg-stone-100/80 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-stone-600"
              >
                Setup flow
              </Badge>
              <div className="space-y-3">
                <h1 className="max-w-md font-serif text-4xl leading-tight tracking-tight text-slate-900 sm:text-5xl">
                  Let&apos;s make this workspace production-ready.
                </h1>
                <p className="max-w-md text-sm leading-6 text-stone-600 sm:text-base">
                  One step at a time. We&apos;ll lock in your model connection,
                  resume pipeline, template source, and the optional auth guard
                  before the rest of Job Ops opens up.
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-[1.75rem] border border-stone-200 bg-white/80 p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em] text-stone-500">
                <span>Progress</span>
                <span>{progressValue}%</span>
              </div>
              <Progress value={progressValue} className="h-2.5 bg-stone-200" />
              <div className="space-y-3 pt-2">
                {steps.map((step, index) => {
                  const active = step.id === currentStep;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      disabled={step.disabled}
                      onClick={() => setCurrentStep(step.id)}
                      className={cn(
                        "flex w-full items-start gap-4 rounded-2xl px-2 py-2 text-left transition",
                        step.disabled
                          ? "cursor-not-allowed opacity-45"
                          : "hover:bg-stone-100/80",
                      )}
                    >
                      <StepStatusBadge
                        active={active}
                        complete={step.complete}
                        index={index}
                      />
                      <div className="min-w-0 space-y-1 pt-1">
                        <div className="text-sm font-semibold text-slate-900">
                          {step.label}
                        </div>
                        <div className="text-sm text-stone-500">
                          {step.subtitle}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[1.5rem] border border-stone-200 bg-stone-100/80 p-4 text-sm leading-6 text-stone-600">
            <div className="mb-1 font-medium text-slate-900">
              Need a shortcut?
            </div>
            Existing values from your environment and settings are prefilled
            here, so you only need to change what is actually different.
          </div>
        </aside>

        <main className="flex min-h-[42rem] flex-1 flex-col justify-between rounded-[2rem] border border-stone-200/70 bg-white/88 p-6 shadow-[0_24px_70px_rgba(15,23,42,0.12)] backdrop-blur sm:p-8 lg:p-10">
          {settingsLoading || !currentStep ? (
            <div className="flex min-h-[24rem] flex-1 items-center justify-center text-sm text-stone-500">
              Loading onboarding...
            </div>
          ) : (
            <form
              className="flex h-full flex-col"
              onSubmit={(event) => {
                event.preventDefault();
                void handlePrimaryAction();
              }}
            >
              <div className="space-y-8">
                <div className="flex flex-wrap items-center gap-3 text-sm text-stone-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-stone-100 px-3 py-1 font-medium text-stone-700">
                    <Sparkles className="h-4 w-4" />
                    {currentCopy.eyebrow}
                  </span>
                  <span>
                    {steps.filter((step) => step.complete).length} of{" "}
                    {steps.length} complete
                  </span>
                </div>

                <div className="max-w-3xl space-y-4">
                  <h2 className="font-serif text-3xl leading-tight tracking-tight text-slate-900 sm:text-[2.75rem]">
                    {currentCopy.title}
                  </h2>
                  <p className="max-w-2xl text-base leading-7 text-stone-600">
                    {currentCopy.description}
                  </p>
                </div>

                <div className="min-h-[25rem] rounded-[1.75rem] border border-stone-200 bg-stone-50/75 p-5 sm:p-6 lg:p-8">
                  {currentStep === "llm" && (
                    <div className="space-y-6">
                      <div className="grid gap-5 lg:grid-cols-2">
                        <div className="space-y-2">
                          <label
                            htmlFor="llmProvider"
                            className="text-sm font-medium text-slate-900"
                          >
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
                                <SelectTrigger
                                  id="llmProvider"
                                  className="h-12 rounded-2xl border-stone-300 bg-white text-left"
                                >
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
                          <p className="text-sm leading-6 text-stone-500">
                            {providerConfig.providerHint}
                          </p>
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
                        ) : (
                          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/80 px-4 py-4 text-sm leading-6 text-stone-500">
                            This provider uses its default endpoint, so there is
                            no base URL to override here.
                          </div>
                        )}
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
                                helper={
                                  llmKeyHint
                                    ? `${providerConfig.keyHelper}. Leave blank to keep the saved key.`
                                    : providerConfig.keyHelper
                                }
                                disabled={isBusy}
                              />
                            )}
                          />
                        ) : (
                          <div className="rounded-2xl border border-dashed border-stone-300 bg-white/80 px-4 py-4 text-sm leading-6 text-stone-500">
                            No API key is required for this provider. Job Ops
                            will only validate the local endpoint details.
                          </div>
                        )}

                        <div className="rounded-[1.5rem] border border-stone-200 bg-white p-4 text-sm leading-6 text-stone-600 shadow-sm">
                          <div className="mb-2 flex items-center gap-2 font-medium text-slate-900">
                            <KeyRound className="h-4 w-4" />
                            Connection notes
                          </div>
                          <p>
                            Existing keys stay in place unless you paste a new
                            one. This step stays visible so you can still swap
                            the provider or endpoint later.
                          </p>
                        </div>
                      </div>

                      <InlineValidation state={llmValidation} />
                    </div>
                  )}

                  {currentStep === "rxresume" && (
                    <div className="space-y-6">
                      <ReactiveResumeConfigPanel
                        pdfRenderer={watch("pdfRenderer")}
                        onPdfRendererChange={(renderer) =>
                          setValue("pdfRenderer", renderer)
                        }
                        disabled={isBusy}
                        showValidationStatus
                        validationStatus={rxresumeValidation}
                        v5={{
                          apiKey: watch("rxresumeApiKey"),
                          onApiKeyChange: (value) =>
                            setValue("rxresumeApiKey", value),
                          helper: settings?.rxresumeApiKeyHint
                            ? "Leave blank to keep the saved v5 API key."
                            : undefined,
                        }}
                        shared={{
                          baseUrl: watch("rxresumeUrl"),
                          onBaseUrlChange: (value) =>
                            setValue("rxresumeUrl", value),
                        }}
                      />
                    </div>
                  )}

                  {currentStep === "baseresume" && (
                    <div className="space-y-6">
                      <div className="max-w-2xl text-sm leading-6 text-stone-600">
                        The template resume is what tailoring starts from every
                        time. Pick the version that already reflects the voice,
                        structure, and sections you want Job Ops to preserve.
                      </div>
                      <Controller
                        name="rxresumeBaseResumeId"
                        control={control}
                        render={({ field }) => (
                          <BaseResumeSelection
                            value={field.value}
                            onValueChange={(value) => {
                              setBaseResumeId(value);
                              field.onChange(value);
                            }}
                            hasRxResumeAccess={rxresumeValidation.valid}
                            disabled={isBusy}
                          />
                        )}
                      />
                      {!rxresumeValidation.valid && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          Finish the RxResume step first so Job Ops can load the
                          list of available resumes.
                        </div>
                      )}
                      <InlineValidation state={baseResumeValidation} />
                    </div>
                  )}

                  {currentStep === "basicauth" && (
                    <div className="space-y-6">
                      <RadioGroup
                        value={basicAuthChoice ?? ""}
                        onValueChange={(value) =>
                          setBasicAuthChoice(
                            value === "enable" || value === "skip"
                              ? value
                              : null,
                          )
                        }
                        className="grid gap-4 lg:grid-cols-2"
                      >
                        {[
                          {
                            value: "enable",
                            title: "Enable basic auth",
                            description:
                              "Require a username and password before write actions run in this workspace.",
                          },
                          {
                            value: "skip",
                            title: "Skip for now",
                            description:
                              "Finish onboarding now and come back in Settings if you decide to lock the app down later.",
                          },
                        ].map((option) => {
                          const checked = basicAuthChoice === option.value;
                          const radioId = `basic-auth-${option.value}`;
                          return (
                            <div
                              key={option.value}
                              className={cn(
                                "flex cursor-pointer items-start gap-4 rounded-[1.5rem] border bg-white p-5 shadow-sm transition",
                                checked
                                  ? "border-slate-900 ring-2 ring-slate-900/10"
                                  : "border-stone-200 hover:border-stone-300",
                              )}
                            >
                              <RadioGroupItem
                                id={radioId}
                                value={option.value}
                                className="mt-1 border-stone-400 text-slate-900"
                              />
                              <label htmlFor={radioId} className="space-y-1">
                                <div className="text-base font-semibold text-slate-900">
                                  {option.title}
                                </div>
                                <div className="text-sm leading-6 text-stone-500">
                                  {option.description}
                                </div>
                              </label>
                            </div>
                          );
                        })}
                      </RadioGroup>

                      {basicAuthChoice === "enable" && (
                        <div className="grid gap-5 rounded-[1.5rem] border border-stone-200 bg-white p-5 shadow-sm lg:grid-cols-2">
                          <div className="space-y-2">
                            <label
                              htmlFor="basicAuthUser"
                              className="text-sm font-medium text-slate-900"
                            >
                              Username
                            </label>
                            <Input
                              id="basicAuthUser"
                              value={watch("basicAuthUser")}
                              onChange={(event) =>
                                setValue(
                                  "basicAuthUser",
                                  event.currentTarget.value,
                                )
                              }
                              placeholder="jobops-admin"
                              className="h-12 rounded-2xl border-stone-300 bg-stone-50"
                              disabled={isBusy}
                            />
                          </div>
                          <div className="space-y-2">
                            <label
                              htmlFor="basicAuthPassword"
                              className="text-sm font-medium text-slate-900"
                            >
                              Password
                            </label>
                            <Input
                              id="basicAuthPassword"
                              type="password"
                              value={watch("basicAuthPassword")}
                              onChange={(event) =>
                                setValue(
                                  "basicAuthPassword",
                                  event.currentTarget.value,
                                )
                              }
                              placeholder="Create a strong password"
                              className="h-12 rounded-2xl border-stone-300 bg-stone-50"
                              disabled={isBusy}
                            />
                          </div>
                        </div>
                      )}

                      <div className="rounded-[1.5rem] border border-stone-200 bg-white p-4 text-sm leading-6 text-stone-600 shadow-sm">
                        <div className="mb-2 flex items-center gap-2 font-medium text-slate-900">
                          <ShieldCheck className="h-4 w-4" />
                          Why this is a decision step
                        </div>
                        <p>
                          Basic auth is optional, but onboarding requires an
                          explicit choice so the workspace never lands in an
                          ambiguous security state.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 flex flex-col gap-3 border-t border-stone-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 rounded-full px-5 text-stone-700"
                  onClick={() => {
                    if (!canGoBack) return;
                    setCurrentStep(steps[stepIndex - 1]?.id ?? currentStep);
                  }}
                  disabled={!canGoBack || isBusy}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>

                <div className="flex flex-col items-start gap-2 sm:items-end">
                  <p className="text-sm text-stone-500">
                    {currentStep === "basicauth"
                      ? "Finish by enabling basic auth or explicitly skipping it for now."
                      : "Each step saves immediately so you can keep moving."}
                  </p>
                  <Button
                    type="submit"
                    size="lg"
                    className="h-12 rounded-full px-6"
                    disabled={
                      isBusy ||
                      (currentStep === "baseresume" &&
                        !rxresumeValidation.valid)
                    }
                  >
                    {primaryLabel}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </form>
          )}
        </main>
      </div>
    </div>
  );
};
