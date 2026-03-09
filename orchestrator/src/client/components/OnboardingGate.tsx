import * as api from "@client/api";
import { ReactiveResumeConfigPanel } from "@client/components/ReactiveResumeConfigPanel";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useRxResumeConfigState } from "@client/hooks/useRxResumeConfigState";
import { useSettings } from "@client/hooks/useSettings";
import {
  getInitialRxResumeMode,
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
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type {
  ResumeExportMode,
  RxResumeMode,
  ValidationResult,
} from "@shared/types.js";
import { Check } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldTitle,
} from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type ValidationState = ValidationResult & { checked: boolean };
type TimestampedValidationState = ValidationState & { testedAt: number | null };

type OnboardingFormData = {
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  resumeExportMode: ResumeExportMode;
  rxresumeMode: RxResumeMode;
  rxresumeEmail: string;
  rxresumePassword: string;
  rxresumeApiKey: string;
  rxresumeBaseResumeId: string | null;
  latexCvTemplatePath: string;
  latexCoverTemplatePath: string;
};

const EMPTY_VALIDATION_STATE: ValidationState = {
  valid: false,
  message: null,
  checked: false,
};

const EMPTY_TIMESTAMPED_VALIDATION_STATE: TimestampedValidationState = {
  ...EMPTY_VALIDATION_STATE,
  testedAt: null,
};

function getStepPrimaryLabel(input: {
  currentStep: string | null;
  llmValidated: boolean;
  exportValidated: boolean;
  baseResumeValidated: boolean;
}): string {
  const toLabel = (isValidated: boolean): string =>
    isValidated ? "Revalidate" : "Validate";

  if (input.currentStep === "llm") return toLabel(input.llmValidated);
  if (input.currentStep === "export") return toLabel(input.exportValidated);
  if (input.currentStep === "baseresume")
    return toLabel(input.baseResumeValidated);
  return "Validate";
}

export const OnboardingGate: React.FC = () => {
  const {
    settings,
    isLoading: settingsLoading,
    refreshSettings,
  } = useSettings();
  const {
    storedRxResume,
    getBaseResumeIdForMode,
    setBaseResumeIdForMode,
    syncBaseResumeIdsForMode,
  } = useRxResumeConfigState(settings);

  const [isSavingEnv, setIsSavingEnv] = useState(false);
  const [isValidatingLlm, setIsValidatingLlm] = useState(false);
  const [isValidatingRxresume, setIsValidatingRxresume] = useState(false);
  const [isValidatingBaseResume, setIsValidatingBaseResume] = useState(false);
  const [isValidatingLatex, setIsValidatingLatex] = useState(false);
  const [llmValidation, setLlmValidation] = useState<ValidationState>(
    EMPTY_VALIDATION_STATE,
  );
  const [rxresumeValidation, setRxresumeValidation] = useState<ValidationState>(
    EMPTY_VALIDATION_STATE,
  );
  const [latexValidation, setLatexValidation] = useState<ValidationState>(
    EMPTY_VALIDATION_STATE,
  );
  const [rxresumeVersionValidations, setRxresumeVersionValidations] = useState<{
    v4: TimestampedValidationState;
    v5: TimestampedValidationState;
  }>({
    v4: EMPTY_TIMESTAMPED_VALIDATION_STATE,
    v5: EMPTY_TIMESTAMPED_VALIDATION_STATE,
  });
  const [baseResumeValidation, setBaseResumeValidation] =
    useState<ValidationState>(EMPTY_VALIDATION_STATE);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [isFormHydrated, setIsFormHydrated] = useState(false);
  const demoInfo = useDemoInfo();
  const demoMode = demoInfo?.demoMode ?? false;

  const { control, watch, getValues, reset, setValue } =
    useForm<OnboardingFormData>({
      defaultValues: {
        llmProvider: "",
        llmBaseUrl: "",
        llmApiKey: "",
        resumeExportMode: "rxresume",
        rxresumeMode: "v5",
        rxresumeEmail: "",
        rxresumePassword: "",
        rxresumeApiKey: "",
        rxresumeBaseResumeId: null,
        latexCvTemplatePath: "",
        latexCoverTemplatePath: "",
      },
    });

  const llmProvider = watch("llmProvider");

  const validateLlm = useCallback(async () => {
    const values = getValues();
    const selectedProvider = normalizeLlmProvider(
      values.llmProvider || settings?.llmProvider?.value || "openrouter",
    );
    const providerConfig = getLlmProviderConfig(selectedProvider);
    const { requiresApiKey, showBaseUrl } = providerConfig;

    setIsValidatingLlm(true);
    try {
      const result = await api.validateLlm({
        provider: selectedProvider,
        baseUrl: showBaseUrl
          ? values.llmBaseUrl.trim() || undefined
          : undefined,
        apiKey: requiresApiKey
          ? values.llmApiKey.trim() || undefined
          : undefined,
      });
      setLlmValidation({ ...result, checked: true });
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "LLM validation failed";
      const result = { valid: false, message };
      setLlmValidation({ ...result, checked: true });
      return result;
    } finally {
      setIsValidatingLlm(false);
    }
  }, [getValues, settings?.llmProvider]);

  const validateBaseResume = useCallback(async () => {
    setIsValidatingBaseResume(true);
    try {
      const result = await api.validateResumeConfig();
      setBaseResumeValidation({ ...result, checked: true });
      return result;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Base resume validation failed";
      const result = { valid: false, message };
      setBaseResumeValidation({ ...result, checked: true });
      return result;
    } finally {
      setIsValidatingBaseResume(false);
    }
  }, []);

  const resumeExportModeValue = watch("resumeExportMode");
  const rxresumeModeValue = watch("rxresumeMode");
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
  const resumeExportModeCurrent = (resumeExportModeValue ||
    settings?.resumeExportMode?.value ||
    "rxresume") as ResumeExportMode;
  const rxresumeModeCurrent = (rxresumeModeValue ||
    settings?.rxresumeMode?.value ||
    "v5") as RxResumeMode;
  const requiresRxResumeValidation = resumeExportModeCurrent === "rxresume";
  const exportValidation = requiresRxResumeValidation
    ? rxresumeValidation
    : latexValidation;
  const hasCheckedValidations =
    (requiresLlmKey ? llmValidation.checked : true) &&
    exportValidation.checked &&
    (requiresRxResumeValidation ? baseResumeValidation.checked : true);
  const llmValidated = requiresLlmKey ? llmValidation.valid : true;
  const shouldOpen =
    !demoMode &&
    Boolean(settings && !settingsLoading) &&
    hasCheckedValidations &&
    !(
      llmValidated &&
      exportValidation.valid &&
      (requiresRxResumeValidation ? baseResumeValidation.valid : true)
    );

  const validateRxresumeVersion = useCallback(
    async (
      version: "v4" | "v5",
    ): Promise<ValidationResult & { checked: true; testedAt: number }> => {
      const values = getValues();
      const draftCredentials = getRxResumeCredentialDrafts(values);
      const testedAt = Date.now();
      const result = await validateAndMaybePersistRxResumeMode({
        mode: version,
        stored: storedRxResume,
        draft: draftCredentials,
        validate: api.validateRxresume,
        getPrecheckMessage: (failure) =>
          failure === "missing-v5-api-key"
            ? "v5 API key required. Add a v5 API key, then test again."
            : "v4 email and password required. Add both credentials, then test again.",
        getValidationErrorMessage: (error, mode) =>
          error instanceof Error
            ? error.message
            : `RxResume ${mode} validation failed`,
      });
      return { ...result.validation, checked: true, testedAt };
    },
    [getValues, storedRxResume],
  );

  const validateRxresume = useCallback(async () => {
    const values = getValues();
    const selectedMode = values.rxresumeMode;

    setIsValidatingRxresume(true);
    try {
      const versionResult = await validateRxresumeVersion(selectedMode);
      setRxresumeVersionValidations((current) => ({
        ...current,
        [selectedMode]: versionResult,
      }));

      const result: ValidationResult = {
        valid: versionResult.valid,
        message: versionResult.message,
      };
      setRxresumeValidation({ ...result, checked: true });
      return result;
    } finally {
      setIsValidatingRxresume(false);
    }
  }, [getValues, validateRxresumeVersion]);

  const validateLatex = useCallback(async () => {
    const values = getValues();
    setIsValidatingLatex(true);
    try {
      const result = await api.validateLatexConfig({
        cvTemplatePath: values.latexCvTemplatePath.trim() || undefined,
        coverTemplatePath: values.latexCoverTemplatePath.trim() || undefined,
      });
      setLatexValidation({ ...result, checked: true });
      return result;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "LaTeX validation failed";
      const result = { valid: false, message };
      setLatexValidation({ ...result, checked: true });
      return result;
    } finally {
      setIsValidatingLatex(false);
    }
  }, [getValues]);

  // Initialize form values from settings
  useEffect(() => {
    if (settings) {
      const initialResumeExportMode =
        (settings.resumeExportMode?.value as ResumeExportMode | undefined) ??
        "rxresume";
      const initialMode = getInitialRxResumeMode({
        savedMode: (settings.rxresumeMode?.value ??
          null) as RxResumeMode | null,
        hasV4: storedRxResume.hasV4,
        hasV5: storedRxResume.hasV5,
      });
      const selectedId = syncBaseResumeIdsForMode(initialMode);
      reset({
        llmProvider: settings.llmProvider?.value || "",
        llmBaseUrl: settings.llmBaseUrl?.value || "",
        llmApiKey: "",
        resumeExportMode: initialResumeExportMode,
        rxresumeMode: initialMode,
        rxresumeEmail: "",
        rxresumePassword: "",
        rxresumeApiKey: "",
        rxresumeBaseResumeId: selectedId,
        latexCvTemplatePath: settings.latexCvTemplatePath ?? "",
        latexCoverTemplatePath: settings.latexCoverTemplatePath ?? "",
      });
      setIsFormHydrated(true);
    }
  }, [
    settings,
    reset,
    storedRxResume.hasV4,
    storedRxResume.hasV5,
    syncBaseResumeIdsForMode,
  ]);

  // Clear base URL when provider doesn't require it
  useEffect(() => {
    if (!showBaseUrl) {
      setValue("llmBaseUrl", "");
    }
  }, [showBaseUrl, setValue]);

  // Reset LLM validation when provider changes
  useEffect(() => {
    if (!selectedProvider) return;
    setLlmValidation({ valid: false, message: null, checked: false });
  }, [selectedProvider]);

  const steps = useMemo(
    () => {
      const exportStep = {
        id: "export",
        label: "Resume Export",
        subtitle:
          resumeExportModeCurrent === "latex"
            ? "LaTeX templates"
            : "RxResume credentials",
        complete:
          resumeExportModeCurrent === "latex"
            ? latexValidation.valid
            : rxresumeValidation.valid,
        disabled: false,
      };

      const baseResumeStep =
        resumeExportModeCurrent === "rxresume"
          ? [
              {
                id: "baseresume",
                label: "Select Template Resume",
                subtitle: "Template selection",
                complete: baseResumeValidation.valid,
                disabled: !rxresumeValidation.valid,
              },
            ]
          : [];

      return [
        {
          id: "llm",
          label: "LLM Provider",
          subtitle: "Provider + credentials",
          complete: llmValidated,
          disabled: false,
        },
        exportStep,
        ...baseResumeStep,
      ];
    },
    [
      llmValidated,
      resumeExportModeCurrent,
      latexValidation.valid,
      rxresumeValidation.valid,
      baseResumeValidation.valid,
    ],
  );

  const defaultStep = steps.find((step) => !step.complete)?.id ?? steps[0]?.id;

  useEffect(() => {
    if (!shouldOpen) return;
    if (!currentStep && defaultStep) {
      setCurrentStep(defaultStep);
    }
  }, [currentStep, defaultStep, shouldOpen]);

  const runAllValidations = useCallback(async () => {
    if (!settings) return;
    const validations: Promise<ValidationResult>[] = [];
    if (requiresLlmKey) {
      validations.push(validateLlm());
    } else {
      setLlmValidation({ valid: true, message: null, checked: true });
    }
    if (requiresRxResumeValidation) {
      validations.push(validateRxresume(), validateBaseResume());
    } else {
      validations.push(validateLatex());
    }

    const results = await Promise.allSettled(validations);

    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      const reason = failed.status === "rejected" ? failed.reason : null;
      const message =
        reason instanceof Error ? reason.message : "Validation checks failed";
      toast.error(message);
    }
  }, [
    settings,
    requiresLlmKey,
    requiresRxResumeValidation,
    validateLlm,
    validateRxresume,
    validateBaseResume,
    validateLatex,
  ]);

  // Run validations on mount when needed
  useEffect(() => {
    if (demoMode) return;
    if (!settings || settingsLoading) return;
    if (!isFormHydrated) return;
    const needsValidation =
      (requiresLlmKey ? !llmValidation.checked : false) ||
      (requiresRxResumeValidation
        ? !rxresumeValidation.checked || !baseResumeValidation.checked
        : !latexValidation.checked);
    if (!needsValidation) return;
    void runAllValidations();
  }, [
    settings,
    settingsLoading,
    requiresLlmKey,
    requiresRxResumeValidation,
    llmValidation.checked,
    rxresumeValidation.checked,
    baseResumeValidation.checked,
    latexValidation.checked,
    runAllValidations,
    demoMode,
    isFormHydrated,
  ]);

  const handleSaveLlm = async (): Promise<boolean> => {
    const values = getValues();
    const apiKeyValue = values.llmApiKey.trim();
    const baseUrlValue = values.llmBaseUrl.trim();

    if (requiresLlmKey && !apiKeyValue && !hasLlmKey) {
      toast.info("Add your LLM API key to continue");
      return false;
    }

    try {
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
      };

      if (showApiKey && apiKeyValue) {
        update.llmApiKey = apiKeyValue;
      }

      setIsSavingEnv(true);
      await api.updateSettings(update);
      await refreshSettings();
      setValue("llmApiKey", "");
      toast.success("LLM provider connected");
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save LLM settings";
      toast.error(message);
      return false;
    } finally {
      setIsSavingEnv(false);
    }
  };

  const handleSaveRxresume = async (): Promise<boolean> => {
    const values = getValues();
    const modeValue = values.rxresumeMode;
    const draftCredentials = getRxResumeCredentialDrafts(values);
    const missing = getRxResumeMissingCredentialLabels({
      mode: modeValue,
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
        mode: modeValue,
        stored: storedRxResume,
        draft: draftCredentials,
        validate: api.validateRxresume,
        persist: async (update) => {
          setIsSavingEnv(true);
          try {
            await api.updateSettings({
              ...update,
              resumeExportMode: "rxresume",
            });
            await refreshSettings();
          } finally {
            setIsSavingEnv(false);
          }
        },
        persistOnSuccess: true,
        getPrecheckMessage: (failure) =>
          failure === "missing-v5-api-key"
            ? "v5 API key required. Add a v5 API key, then test again."
            : "v4 email and password required. Add both credentials, then test again.",
        getValidationErrorMessage: (error) =>
          error instanceof Error ? error.message : "RxResume validation failed",
        getPersistErrorMessage: (error) =>
          error instanceof Error
            ? error.message
            : "Failed to save RxResume credentials",
      });

      setRxresumeVersionValidations((current) => ({
        ...current,
        [modeValue]: {
          ...result.validation,
          checked: true,
          testedAt: Date.now(),
        },
      }));
      setRxresumeValidation({ ...result.validation, checked: true });

      if (!result.validation.valid) {
        toast.error(result.validation.message || "RxResume validation failed");
        return false;
      }
      setValue("rxresumePassword", "");
      setValue("rxresumeApiKey", "");

      toast.success("RxResume connected");
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save RxResume credentials";
      toast.error(message);
      return false;
    } finally {
      setIsValidatingRxresume(false);
      setIsSavingEnv(false);
    }
  };

  const handleSaveLatex = async (): Promise<boolean> => {
    const values = getValues();
    if (!values.latexCvTemplatePath.trim()) {
      toast.info("Set a LaTeX CV template path to continue");
      return false;
    }

    try {
      const validation = await validateLatex();
      if (!validation.valid) {
        toast.error(validation.message || "LaTeX validation failed");
        return false;
      }

      setIsSavingEnv(true);
      await api.updateSettings({
        resumeExportMode: "latex",
        latexCvTemplatePath: values.latexCvTemplatePath.trim() || null,
        latexCoverTemplatePath: values.latexCoverTemplatePath.trim() || null,
      });
      await refreshSettings();
      toast.success("LaTeX export configured");
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save LaTeX settings";
      toast.error(message);
      return false;
    } finally {
      setIsSavingEnv(false);
    }
  };

  const handleSaveExportConfig = async (): Promise<boolean> => {
    const mode = getValues().resumeExportMode;
    if (mode === "latex") {
      return handleSaveLatex();
    }
    return handleSaveRxresume();
  };

  const handleSaveBaseResume = async (): Promise<boolean> => {
    const values = getValues();

    if (!values.rxresumeBaseResumeId) {
      toast.info("Select a base resume to continue");
      return false;
    }

    try {
      setIsSavingEnv(true);
      await api.updateSettings({
        resumeExportMode: "rxresume",
        rxresumeMode: values.rxresumeMode,
        rxresumeBaseResumeId: values.rxresumeBaseResumeId,
      });
      const validation = await validateBaseResume();
      if (!validation.valid) {
        toast.error(validation.message || "Base resume validation failed");
        return false;
      }

      await refreshSettings();
      toast.success("Base resume set");
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save base resume";
      toast.error(message);
      return false;
    } finally {
      setIsSavingEnv(false);
    }
  };

  const resolvedStepIndex = currentStep
    ? steps.findIndex((step) => step.id === currentStep)
    : 0;
  const stepIndex = resolvedStepIndex >= 0 ? resolvedStepIndex : 0;
  const completedSteps = steps.filter((step) => step.complete).length;
  const progressValue =
    steps.length > 0 ? Math.round((completedSteps / steps.length) * 100) : 0;
  const isBusy =
    isSavingEnv ||
    settingsLoading ||
    isValidatingLlm ||
    isValidatingRxresume ||
    isValidatingBaseResume ||
    isValidatingLatex;
  const canGoBack = stepIndex > 0;

  const handlePrimaryAction = async () => {
    if (!currentStep) return;
    if (currentStep === "llm") {
      await handleSaveLlm();
      return;
    }
    if (currentStep === "export") {
      await handleSaveExportConfig();
      return;
    }
    if (currentStep === "baseresume") {
      await handleSaveBaseResume();
      return;
    }
  };

  const handleBack = () => {
    if (!canGoBack) return;
    setCurrentStep(steps[stepIndex - 1]?.id ?? currentStep);
  };

  if (!shouldOpen || !currentStep) return null;

  return (
    <AlertDialog open>
      <AlertDialogContent
        className="max-w-3xl max-h-[90vh] overflow-hidden p-0"
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <div className="space-y-6 px-6 py-6 max-h-[calc(90vh-3.5rem)] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle>Welcome to Job Ops</AlertDialogTitle>
            <AlertDialogDescription>
              Let's get your workspace ready. Add your keys and resume once,
              then the pipeline can run end-to-end.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <Tabs value={currentStep} onValueChange={setCurrentStep}>
            <TabsList
              className={cn(
                "grid h-auto w-full grid-cols-1 gap-2 border-b border-border/60 bg-transparent p-0 text-left",
                steps.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3",
              )}
            >
              {steps.map((step, index) => {
                const isActive = step.id === currentStep;
                const isComplete = step.complete;

                return (
                  <FieldLabel
                    key={step.id}
                    className={cn(
                      "w-full [&>[data-slot=field]]:border-0 [&>[data-slot=field]]:p-0 [&>[data-slot=field]]:rounded-none",
                      step.disabled && "opacity-50 cursor-not-allowed",
                    )}
                  >
                    <TabsTrigger
                      value={step.id}
                      disabled={step.disabled}
                      className={cn(
                        "w-full rounded-md hover:bg-muted/60 border-b-2 border-transparent px-3 py-4 text-left shadow-none",
                        isActive
                          ? "border-primary !bg-muted/60 text-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      <Field orientation="horizontal" className="items-start">
                        <FieldContent>
                          <FieldTitle>{step.label}</FieldTitle>
                          <FieldDescription>{step.subtitle}</FieldDescription>
                        </FieldContent>
                        <span
                          className={cn(
                            "mt-0.5 flex h-6 w-6 items-center justify-center rounded-md text-xs font-semibold",
                            isComplete
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {isComplete ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            index + 1
                          )}
                        </span>
                      </Field>
                    </TabsTrigger>
                  </FieldLabel>
                );
              })}
            </TabsList>

            <TabsContent value="llm" className="space-y-4 pt-6">
              <div>
                <p className="text-sm font-semibold">Connect LLM provider</p>
                <p className="text-xs text-muted-foreground">
                  Used for job scoring, summaries, and tailoring.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
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
                        onValueChange={(value) => {
                          field.onChange(value);
                        }}
                        disabled={isSavingEnv}
                      >
                        <SelectTrigger id="llmProvider">
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
                  <p className="text-xs text-muted-foreground">
                    {providerConfig.providerHint}
                  </p>
                </div>
                {showBaseUrl && (
                  <Controller
                    name="llmBaseUrl"
                    control={control}
                    render={({ field }) => (
                      <SettingsInput
                        label="LLM base URL"
                        inputProps={{
                          name: "llmBaseUrl",
                          value: field.value,
                          onChange: field.onChange,
                        }}
                        placeholder={providerConfig.baseUrlPlaceholder}
                        helper={providerConfig.baseUrlHelper}
                        current={settings?.llmBaseUrl?.value || "—"}
                        disabled={isSavingEnv}
                      />
                    )}
                  />
                )}
                {showApiKey && (
                  <Controller
                    name="llmApiKey"
                    control={control}
                    render={({ field }) => (
                      <SettingsInput
                        label="LLM API key"
                        inputProps={{
                          name: "llmApiKey",
                          value: field.value,
                          onChange: field.onChange,
                        }}
                        type="password"
                        placeholder="Enter key"
                        helper={
                          llmKeyHint
                            ? `${providerConfig.keyHelper}. Leave blank to use the saved key.`
                            : providerConfig.keyHelper
                        }
                        disabled={isSavingEnv}
                      />
                    )}
                  />
                )}
              </div>
            </TabsContent>

            <TabsContent value="export" className="space-y-4 pt-6">
              <div className="space-y-2">
                <label htmlFor="resumeExportMode" className="text-sm font-medium">
                  Export mode
                </label>
                <Select
                  value={resumeExportModeCurrent}
                  onValueChange={(value) => {
                    const mode = value === "latex" ? "latex" : "rxresume";
                    setValue("resumeExportMode", mode);
                    if (mode === "rxresume") {
                      setLatexValidation(EMPTY_VALIDATION_STATE);
                    } else {
                      setRxresumeValidation(EMPTY_VALIDATION_STATE);
                      setBaseResumeValidation(EMPTY_VALIDATION_STATE);
                    }
                  }}
                  disabled={isSavingEnv}
                >
                  <SelectTrigger id="resumeExportMode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rxresume">RxResume</SelectItem>
                    <SelectItem value="latex">LaTeX</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This only generates tailored resume artifacts. Job Ops does
                  not auto-apply to jobs.
                </p>
              </div>

              {resumeExportModeCurrent === "rxresume" ? (
                <ReactiveResumeConfigPanel
                  mode={rxresumeModeCurrent}
                  onModeChange={(mode) => {
                    setValue("rxresumeMode", mode);
                    setValue(
                      "rxresumeBaseResumeId",
                      getBaseResumeIdForMode(mode),
                    );
                    setRxresumeValidation((previous) => ({
                      ...EMPTY_VALIDATION_STATE,
                      checked: previous.checked,
                    }));
                  }}
                  disabled={isSavingEnv}
                  showValidationStatus
                  validationStatuses={rxresumeVersionValidations}
                  intro={{
                    title: "Link your RxResume account",
                    description:
                      "Used to export tailored PDFs. Choose between Reactive Resume version 4 and 5, and provide the credentials.",
                  }}
                  v5={{
                    apiKey: watch("rxresumeApiKey"),
                    onApiKeyChange: (value) =>
                      setValue("rxresumeApiKey", value),
                  }}
                  v4={{
                    email: watch("rxresumeEmail"),
                    onEmailChange: (value) => setValue("rxresumeEmail", value),
                    password: watch("rxresumePassword"),
                    onPasswordChange: (value) =>
                      setValue("rxresumePassword", value),
                  }}
                />
              ) : (
                <div className="space-y-4">
                  <SettingsInput
                    label="CV template path"
                    inputProps={{
                      name: "latexCvTemplatePath",
                      value: watch("latexCvTemplatePath"),
                      onChange: (event) =>
                        setValue("latexCvTemplatePath", event.currentTarget.value),
                    }}
                    placeholder="/absolute/path/to/cv-template.tex"
                    helper="Required when LaTeX mode is enabled."
                    disabled={isSavingEnv}
                  />
                  <SettingsInput
                    label="Cover template path (optional)"
                    inputProps={{
                      name: "latexCoverTemplatePath",
                      value: watch("latexCoverTemplatePath"),
                      onChange: (event) =>
                        setValue(
                          "latexCoverTemplatePath",
                          event.currentTarget.value,
                        ),
                    }}
                    placeholder="/absolute/path/to/cover-template.tex"
                    helper="Optional. Leave blank to generate CV only."
                    disabled={isSavingEnv}
                  />
                  {latexValidation.checked ? (
                    <p
                      className={cn(
                        "text-xs",
                        latexValidation.valid
                          ? "text-emerald-600"
                          : "text-destructive",
                      )}
                    >
                      {latexValidation.message ??
                        (latexValidation.valid
                          ? "LaTeX settings are valid."
                          : "LaTeX settings are invalid.")}
                    </p>
                  ) : null}
                </div>
              )}
            </TabsContent>

            {requiresRxResumeValidation ? (
              <TabsContent value="baseresume" className="space-y-4 pt-6">
                <div>
                  <p className="text-sm font-semibold">
                    Select your template resume
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Choose the resume you want to use as a template. The
                    selected resume will be used as a template for tailoring.
                  </p>
                </div>
                <Controller
                  name="rxresumeBaseResumeId"
                  control={control}
                  render={({ field }) => (
                    <BaseResumeSelection
                      value={field.value}
                      onValueChange={(value) => {
                        const mode = (getValues("rxresumeMode") ??
                          "v5") as RxResumeMode;
                        setBaseResumeIdForMode(mode, value);
                        field.onChange(value);
                      }}
                      hasRxResumeAccess={rxresumeValidation.valid}
                      rxresumeMode={rxresumeModeCurrent}
                      disabled={isSavingEnv}
                    />
                  )}
                />
              </TabsContent>
            ) : null}
          </Tabs>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={!canGoBack || isBusy}
            >
              Back
            </Button>
            <div className="flex items-center gap-2">
              <Button onClick={handlePrimaryAction} disabled={isBusy}>
                {isBusy
                  ? "Validating..."
                  : getStepPrimaryLabel({
                      currentStep,
                      llmValidated,
                      exportValidated: exportValidation.valid,
                      baseResumeValidated: baseResumeValidation.valid,
                    })}
              </Button>
            </div>
          </div>

          <Progress value={progressValue} className="h-2" />
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
