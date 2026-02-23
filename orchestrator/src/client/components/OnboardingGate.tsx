import * as api from "@client/api";
import { ReactiveResumeConfigPanel } from "@client/components/ReactiveResumeConfigPanel";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useSettings } from "@client/hooks/useSettings";
import { BaseResumeSelection } from "@client/pages/settings/components/BaseResumeSelection";
import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import {
  getLlmProviderConfig,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDERS,
  normalizeLlmProvider,
} from "@client/pages/settings/utils";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type { RxResumeMode, ValidationResult } from "@shared/types.js";
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
  rxresumeMode: RxResumeMode;
  rxresumeEmail: string;
  rxresumePassword: string;
  rxresumeApiKey: string;
  rxresumeBaseResumeId: string | null;
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

function getRxresumeTestLabel(mode: RxResumeMode): string {
  if (mode === "v5") return "Test v5";
  return "Test v4";
}

function getInitialOnboardingRxresumeMode(input: {
  savedMode: RxResumeMode | null | undefined;
  hasV4: boolean;
  hasV5: boolean;
}): RxResumeMode {
  if (input.savedMode === "v4" || input.savedMode === "v5")
    return input.savedMode;
  if (input.hasV4 && !input.hasV5) return "v4";
  return "v5";
}

function getStepPrimaryLabel(input: {
  currentStep: string | null;
  llmValidated: boolean;
  rxresumeValidated: boolean;
  baseResumeValidated: boolean;
}): string {
  const toLabel = (isValidated: boolean): string =>
    isValidated ? "Revalidate" : "Validate";

  if (input.currentStep === "llm") return toLabel(input.llmValidated);
  if (input.currentStep === "rxresume") return toLabel(input.rxresumeValidated);
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

  const [isSavingEnv, setIsSavingEnv] = useState(false);
  const [isValidatingLlm, setIsValidatingLlm] = useState(false);
  const [isValidatingRxresume, setIsValidatingRxresume] = useState(false);
  const [isValidatingBaseResume, setIsValidatingBaseResume] = useState(false);
  const [llmValidation, setLlmValidation] = useState<ValidationState>(
    EMPTY_VALIDATION_STATE,
  );
  const [rxresumeValidation, setRxresumeValidation] = useState<ValidationState>(
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
  const [rxresumeBaseResumeIdsByMode, setRxresumeBaseResumeIdsByMode] =
    useState<Record<RxResumeMode, string | null>>({
      v4: null,
      v5: null,
    });
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const demoInfo = useDemoInfo();
  const demoMode = demoInfo?.demoMode ?? false;

  const { control, watch, getValues, reset, setValue } =
    useForm<OnboardingFormData>({
      defaultValues: {
        llmProvider: "",
        llmBaseUrl: "",
        llmApiKey: "",
        rxresumeMode: "v5",
        rxresumeEmail: "",
        rxresumePassword: "",
        rxresumeApiKey: "",
        rxresumeBaseResumeId: null,
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
  const hasRxresumeEmail = Boolean(settings?.rxresumeEmail?.trim());
  const hasRxresumePassword = Boolean(settings?.rxresumePasswordHint);
  const hasRxresumeApiKey = Boolean(settings?.rxresumeApiKeyHint);
  const rxresumeModeCurrent = (rxresumeModeValue ||
    settings?.rxresumeMode?.value ||
    "v5") as RxResumeMode;
  const hasCheckedValidations =
    (requiresLlmKey ? llmValidation.checked : true) &&
    rxresumeValidation.checked &&
    baseResumeValidation.checked;
  const llmValidated = requiresLlmKey ? llmValidation.valid : true;
  const shouldOpen =
    !demoMode &&
    Boolean(settings && !settingsLoading) &&
    hasCheckedValidations &&
    !(llmValidated && rxresumeValidation.valid && baseResumeValidation.valid);

  const validateRxresumeVersion = useCallback(
    async (
      version: "v4" | "v5",
    ): Promise<ValidationResult & { checked: true; testedAt: number }> => {
      const values = getValues();
      const emailValue = values.rxresumeEmail.trim();
      const passwordValue = values.rxresumePassword.trim();
      const apiKeyValue = values.rxresumeApiKey.trim();
      const hasV4Configured =
        (hasRxresumeEmail || Boolean(emailValue)) &&
        (hasRxresumePassword || Boolean(passwordValue));
      const hasV5Configured = hasRxresumeApiKey || Boolean(apiKeyValue);
      const testedAt = Date.now();

      if (version === "v5" && !hasV5Configured) {
        return {
          valid: false,
          message: "v5 API key required. Add a v5 API key, then test again.",
          checked: true,
          testedAt,
        };
      }

      if (version === "v4" && !hasV4Configured) {
        return {
          valid: false,
          message:
            "v4 email and password required. Add both credentials, then test again.",
          checked: true,
          testedAt,
        };
      }

      try {
        const result = await api.validateRxresume({
          mode: version,
          email: emailValue || undefined,
          password: passwordValue || undefined,
          apiKey: apiKeyValue || undefined,
        });
        return { ...result, checked: true, testedAt };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : `RxResume ${version} validation failed`;
        return { valid: false, message, checked: true, testedAt };
      }
    },
    [getValues, hasRxresumeApiKey, hasRxresumeEmail, hasRxresumePassword],
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

  // Initialize form values from settings
  useEffect(() => {
    if (settings) {
      const initialMode = getInitialOnboardingRxresumeMode({
        savedMode: (settings.rxresumeMode?.value ?? null) as RxResumeMode | null,
        hasV4: Boolean(
          settings.rxresumeEmail?.trim() && settings.rxresumePasswordHint,
        ),
        hasV5: Boolean(settings.rxresumeApiKeyHint),
      });
      const v4Id =
        settings.rxresumeBaseResumeIdV4 ??
        (initialMode === "v4" ? settings.rxresumeBaseResumeId : null);
      const v5Id =
        settings.rxresumeBaseResumeIdV5 ??
        (initialMode === "v5" ? settings.rxresumeBaseResumeId : null);
      setRxresumeBaseResumeIdsByMode({ v4: v4Id, v5: v5Id });
      reset({
        llmProvider: settings.llmProvider?.value || "",
        llmBaseUrl: settings.llmBaseUrl?.value || "",
        llmApiKey: "",
        rxresumeMode: initialMode,
        rxresumeEmail: "",
        rxresumePassword: "",
        rxresumeApiKey: "",
        rxresumeBaseResumeId: (initialMode === "v4" ? v4Id : v5Id) || null,
      });
    }
  }, [settings, reset]);

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
    () => [
      {
        id: "llm",
        label: "LLM Provider",
        subtitle: "Provider + credentials",
        complete: llmValidated,
        disabled: false,
      },
      {
        id: "rxresume",
        label: "Connect Reactive Resume",
        subtitle: "Version + credentials",
        complete: rxresumeValidation.valid,
        disabled: false,
      },
      {
        id: "baseresume",
        label: "Select Template Resume",
        subtitle: "Template selection",
        complete: baseResumeValidation.valid,
        disabled: !rxresumeValidation.valid,
      },
    ],
    [llmValidated, rxresumeValidation.valid, baseResumeValidation.valid],
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
    validations.push(validateRxresume(), validateBaseResume());

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
    validateLlm,
    validateRxresume,
    validateBaseResume,
  ]);

  // Run validations on mount when needed
  useEffect(() => {
    if (demoMode) return;
    if (!settings || settingsLoading) return;
    const needsValidation =
      (requiresLlmKey ? !llmValidation.checked : false) ||
      !rxresumeValidation.checked ||
      !baseResumeValidation.checked;
    if (!needsValidation) return;
    void runAllValidations();
  }, [
    settings,
    settingsLoading,
    requiresLlmKey,
    llmValidation.checked,
    rxresumeValidation.checked,
    baseResumeValidation.checked,
    runAllValidations,
    demoMode,
  ]);

  const handleRefresh = async () => {
    const results = await Promise.allSettled([
      refreshSettings(),
      runAllValidations(),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      const reason = failed.status === "rejected" ? failed.reason : null;
      const message =
        reason instanceof Error ? reason.message : "Failed to refresh setup";
      toast.error(message);
    }
  };

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
    const emailValue = values.rxresumeEmail.trim();
    const passwordValue = values.rxresumePassword.trim();
    const apiKeyValue = values.rxresumeApiKey.trim();
    const missing: string[] = [];

    if (modeValue === "v5") {
      if (!hasRxresumeApiKey && !apiKeyValue)
        missing.push("RxResume v5 API key");
    } else if (modeValue === "v4") {
      if (!hasRxresumeEmail && !emailValue) missing.push("RxResume email");
      if (!hasRxresumePassword && !passwordValue)
        missing.push("RxResume password");
    }

    if (missing.length > 0) {
      toast.info("Almost there", {
        description: `Missing: ${missing.join(", ")}`,
      });
      return false;
    }

    try {
      const validation = await validateRxresume();
      if (!validation.valid) {
        toast.error(validation.message || "RxResume validation failed");
        return false;
      }

      const update: Partial<UpdateSettingsInput> = {
        rxresumeMode: modeValue,
      };
      if (emailValue) update.rxresumeEmail = emailValue;
      if (passwordValue) update.rxresumePassword = passwordValue;
      if (apiKeyValue) update.rxresumeApiKey = apiKeyValue;

      if (Object.keys(update).length > 0) {
        setIsSavingEnv(true);
        await api.updateSettings(update);
        await refreshSettings();
        setValue("rxresumePassword", "");
        setValue("rxresumeApiKey", "");
      }

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
      setIsSavingEnv(false);
    }
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
    isValidatingBaseResume;
  const canGoBack = stepIndex > 0;
  const primaryLabel = getStepPrimaryLabel({
    currentStep,
    llmValidated,
    rxresumeValidated: rxresumeValidation.valid,
    baseResumeValidated: baseResumeValidation.valid,
  });
  const secondaryActionLabel =
    currentStep === "rxresume"
      ? getRxresumeTestLabel(rxresumeModeCurrent)
      : "Re-test status";
  const primaryActionLabel =
    currentStep === "rxresume" ? "Save & Continue" : primaryLabel;

  const handleSecondaryAction = async () => {
    if (!currentStep) return;
    if (currentStep === "llm") {
      await validateLlm();
      return;
    }
    if (currentStep === "rxresume") {
      await validateRxresume();
      return;
    }
    if (currentStep === "baseresume") {
      await validateBaseResume();
      return;
    }
    await handleRefresh();
  };

  const handlePrimaryAction = async () => {
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
            <TabsList className="grid h-auto w-full grid-cols-1 gap-2 border-b border-border/60 bg-transparent p-0 text-left sm:grid-cols-3">
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

            <TabsContent value="rxresume" className="space-y-4 pt-6">
              <ReactiveResumeConfigPanel
                mode={rxresumeModeCurrent}
                onModeChange={(mode) => {
                  setValue("rxresumeMode", mode);
                  setValue("rxresumeBaseResumeId", rxresumeBaseResumeIdsByMode[mode]);
                  setRxresumeValidation(EMPTY_VALIDATION_STATE);
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
                  onApiKeyChange: (value) => setValue("rxresumeApiKey", value),
                  helper:
                    "Required for v5. Enter a new key to replace the saved key when you save.",
                }}
                v4={{
                  email: watch("rxresumeEmail"),
                  onEmailChange: (value) => setValue("rxresumeEmail", value),
                  password: watch("rxresumePassword"),
                  onPasswordChange: (value) =>
                    setValue("rxresumePassword", value),
                }}
              />
            </TabsContent>

            <TabsContent value="baseresume" className="space-y-4 pt-6">
              <div>
                <p className="text-sm font-semibold">
                  Select your template resume
                </p>
                <p className="text-xs text-muted-foreground">
                  Choose the resume you want to use as a template. The selected
                  resume will be used as a template for tailoring.
                </p>
              </div>
              <Controller
                name="rxresumeBaseResumeId"
                control={control}
                render={({ field }) => (
                  <BaseResumeSelection
                    value={field.value}
                    onValueChange={(value) => {
                      const mode = (getValues("rxresumeMode") ?? "v5") as RxResumeMode;
                      setRxresumeBaseResumeIdsByMode((prev) => ({
                        ...prev,
                        [mode]: value,
                      }));
                      field.onChange(value);
                    }}
                    hasRxResumeAccess={rxresumeValidation.valid}
                    disabled={isSavingEnv}
                  />
                )}
              />
            </TabsContent>
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
              <Button
                variant="ghost"
                onClick={handleSecondaryAction}
                disabled={isBusy}
              >
                {secondaryActionLabel}
              </Button>
              <Button onClick={handlePrimaryAction} disabled={isBusy}>
                {isBusy ? "Working..." : primaryActionLabel}
              </Button>
            </div>
          </div>

          <Progress value={progressValue} className="h-2" />

          <div className="rounded-lg border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
            Friendly heads-up: pipelines can be slow or a little flaky in alpha.
            If anything feels off, open a GitHub issue and we will take a look.{" "}
            <a
              className="font-semibold text-foreground underline underline-offset-2"
              href="https://github.com/DaKheera47/job-ops/issues"
              target="_blank"
              rel="noreferrer"
            >
              Open an issue
            </a>
            .
          </div>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
};
