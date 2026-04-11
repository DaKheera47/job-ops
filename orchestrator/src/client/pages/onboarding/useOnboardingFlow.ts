import * as api from "@client/api";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useRxResumeConfigState } from "@client/hooks/useRxResumeConfigState";
import { useSettings } from "@client/hooks/useSettings";
import { queryKeys } from "@client/lib/queryKeys";
import {
  getRxResumeCredentialDrafts,
  getRxResumeMissingCredentialLabels,
  validateAndMaybePersistRxResumeMode,
} from "@client/lib/rxresume-config";
import {
  getLlmProviderConfig,
  normalizeLlmProvider,
} from "@client/pages/settings/utils";
import { getDefaultModelForProvider } from "@shared/settings-registry";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type { AppSettings, ValidationResult } from "@shared/types.js";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { EMPTY_VALIDATION_STATE, STEP_COPY } from "./content";
import type {
  BasicAuthChoice,
  OnboardingFormData,
  OnboardingStep,
  StepId,
  ValidationState,
} from "./types";

export function useOnboardingFlow() {
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
  const [basicAuthChoice, setBasicAuthChoice] = useState<BasicAuthChoice>(null);
  const [isRxResumeSelfHosted, setIsRxResumeSelfHosted] = useState(false);
  const [currentStep, setCurrentStep] = useState<StepId | null>(null);

  const { control, getValues, reset, setValue, watch } =
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
    setBasicAuthChoice(
      settings.basicAuthActive
        ? "enable"
        : settings.onboardingBasicAuthDecision === "skipped"
          ? "skip"
          : null,
    );
    setIsRxResumeSelfHosted(Boolean(settings.rxresumeUrl));
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
  const llmValidated = llmValidation.valid;
  const basicAuthComplete = Boolean(
    settings?.basicAuthActive || settings?.onboardingBasicAuthDecision !== null,
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
        draft: getRxResumeCredentialDrafts({
          ...getValues(),
          rxresumeUrl: isRxResumeSelfHosted ? getValues().rxresumeUrl : "",
        }),
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
  }, [getValues, isRxResumeSelfHosted, storedRxResume]);

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

    const validations: Promise<ValidationResult>[] = [
      validateLlm(),
      validateRxresume(),
      validateBaseResume(),
    ];
    await Promise.allSettled(validations);
  }, [demoMode, settings, validateBaseResume, validateLlm, validateRxresume]);

  useEffect(() => {
    if (demoMode || !settings || settingsLoading) return;

    const needsValidation =
      !llmValidation.checked ||
      !rxresumeValidation.checked ||
      !baseResumeValidation.checked;
    if (!needsValidation) return;

    void runAllValidations();
  }, [
    baseResumeValidation.checked,
    demoMode,
    llmValidation.checked,
    runAllValidations,
    rxresumeValidation.checked,
    settings,
    settingsLoading,
  ]);

  const steps = useMemo<OnboardingStep[]>(
    () => [
      {
        id: "llm",
        label: "LLM",
        subtitle: "Provider, credentials, and endpoint",
        complete: llmValidated,
        disabled: false,
      },
      {
        id: "rxresume",
        label: "RxResume",
        subtitle: "Resume export connection",
        complete: rxresumeValidation.valid,
        disabled: false,
      },
      {
        id: "baseresume",
        label: "Template",
        subtitle: "Choose the source resume",
        complete: baseResumeValidation.valid,
        disabled: !rxresumeValidation.valid,
      },
      {
        id: "basicauth",
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

    setCurrentStep((existing) => {
      if (!existing) return steps[0].id;
      const existingStep = steps.find((step) => step.id === existing);
      if (!existingStep) return steps[0].id;
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

  const handleSaveLlm = useCallback(async () => {
    const values = getValues();
    const apiKeyValue = values.llmApiKey.trim();
    const baseUrlValue = values.llmBaseUrl.trim();

    if (requiresLlmKey && !apiKeyValue && !hasLlmKey) {
      toast.info("Add your LLM API key to continue");
      return false;
    }

    const validation = await validateLlm();

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
    const draftCredentials = getRxResumeCredentialDrafts({
      ...values,
      rxresumeUrl: isRxResumeSelfHosted ? values.rxresumeUrl : "",
    });
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
  }, [
    getValues,
    isRxResumeSelfHosted,
    setValue,
    storedRxResume,
    syncSettingsCache,
  ]);

  const handleRxresumeSelfHostedChange = useCallback(
    (next: boolean) => {
      setIsRxResumeSelfHosted(next);
      if (!next) {
        setValue("rxresumeUrl", "");
      }
    },
    [setValue],
  );

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
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save base resume",
      );
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [getValues, syncSettingsCache, validateBaseResume]);

  const handleCompleteBasicAuth = useCallback(async () => {
    if (basicAuthChoice === "skip") {
      try {
        setIsSaving(true);
        const nextSettings = await api.updateSettings({
          onboardingBasicAuthDecision: "skipped",
        });
        syncSettingsCache(nextSettings);
        toast.success("Basic auth skipped for now");
        return true;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to save onboarding progress",
        );
        return false;
      } finally {
        setIsSaving(false);
      }
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
        onboardingBasicAuthDecision: "enabled",
      });
      syncSettingsCache(nextSettings);
      setValue("basicAuthPassword", "");
      toast.success("Basic auth enabled");
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
  }, [basicAuthChoice, getValues, setValue, syncSettingsCache]);

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
        : "Save connection"
      : currentStep === "rxresume"
        ? rxresumeValidation.valid
          ? "Recheck connection"
          : "Save connection"
        : currentStep === "baseresume"
          ? baseResumeValidation.valid
            ? "Recheck selection"
            : "Save selection"
          : basicAuthChoice === "enable"
            ? "Enable basic auth"
            : basicAuthChoice === "skip"
              ? "Finish onboarding"
              : "Choose an option";

  return {
    baseResumeValidation,
    basicAuthChoice,
    canGoBack,
    complete,
    control,
    currentCopy,
    currentStep,
    demoMode,
    handleRxresumeSelfHostedChange,
    isBusy,
    isRxResumeSelfHosted,
    llmKeyHint,
    llmValidation,
    primaryLabel,
    progressValue,
    rxresumeValidation,
    selectedProvider,
    settings,
    settingsLoading,
    steps,
    watch,
    setCurrentStep,
    setBasicAuthChoice,
    setValue,
    setBaseResumeId,
    handleBack: () => {
      if (!canGoBack) return;
      setCurrentStep(steps[stepIndex - 1]?.id ?? currentStep);
    },
    handlePrimaryAction,
  };
}
