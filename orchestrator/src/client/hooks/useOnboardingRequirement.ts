import * as api from "@client/api";
import { useDemoInfo } from "@client/hooks/useDemoInfo";
import { useSettings } from "@client/hooks/useSettings";
import { readBasicAuthDecision } from "@client/lib/onboarding";
import { normalizeLlmProvider } from "@client/pages/settings/utils";
import type { ValidationResult } from "@shared/types";
import { useCallback, useEffect, useMemo, useState } from "react";

const EMPTY_VALIDATION_STATE: ValidationResult & { checked: boolean } = {
  valid: false,
  message: null,
  checked: false,
};

export function useOnboardingRequirement() {
  const { settings, isLoading: settingsLoading } = useSettings();
  const demoInfo = useDemoInfo();
  const demoMode = demoInfo?.demoMode ?? false;

  const [llmValidation, setLlmValidation] = useState(EMPTY_VALIDATION_STATE);
  const [rxresumeValidation, setRxresumeValidation] = useState(
    EMPTY_VALIDATION_STATE,
  );
  const [baseResumeValidation, setBaseResumeValidation] = useState(
    EMPTY_VALIDATION_STATE,
  );
  const [basicAuthDecision, setBasicAuthDecision] = useState(
    readBasicAuthDecision,
  );

  const selectedProvider = normalizeLlmProvider(settings?.llmProvider?.value);
  const requiresLlmKey =
    selectedProvider === "openrouter" ||
    selectedProvider === "openai" ||
    selectedProvider === "openai_compatible" ||
    selectedProvider === "gemini";

  const runValidations = useCallback(async () => {
    if (!settings) return;

    const validations: Promise<ValidationResult>[] = [];
    if (requiresLlmKey) {
      validations.push(
        api
          .validateLlm({
            provider: selectedProvider,
            baseUrl: settings.llmBaseUrl?.value || undefined,
          })
          .then((result) => {
            setLlmValidation({ ...result, checked: true });
            return result;
          })
          .catch((error: unknown) => {
            const result = {
              valid: false,
              message:
                error instanceof Error
                  ? error.message
                  : "LLM validation failed",
            };
            setLlmValidation({ ...result, checked: true });
            return result;
          }),
      );
    } else {
      setLlmValidation({ valid: true, message: null, checked: true });
    }

    validations.push(
      api
        .validateRxresume({
          baseUrl: settings.rxresumeUrl ?? undefined,
        })
        .then((result) => {
          setRxresumeValidation({ ...result, checked: true });
          return result;
        })
        .catch((error: unknown) => {
          const result = {
            valid: false,
            message:
              error instanceof Error
                ? error.message
                : "RxResume validation failed",
          };
          setRxresumeValidation({ ...result, checked: true });
          return result;
        }),
    );

    validations.push(
      api
        .validateResumeConfig()
        .then((result) => {
          setBaseResumeValidation({ ...result, checked: true });
          return result;
        })
        .catch((error: unknown) => {
          const result = {
            valid: false,
            message:
              error instanceof Error
                ? error.message
                : "Base resume validation failed",
          };
          setBaseResumeValidation({ ...result, checked: true });
          return result;
        }),
    );

    await Promise.allSettled(validations);
  }, [requiresLlmKey, selectedProvider, settings]);

  useEffect(() => {
    setBasicAuthDecision(readBasicAuthDecision());
  }, []);

  useEffect(() => {
    if (demoMode || !settings || settingsLoading) return;

    const needsValidation =
      (requiresLlmKey ? !llmValidation.checked : false) ||
      !rxresumeValidation.checked ||
      !baseResumeValidation.checked;

    if (!needsValidation) return;
    void runValidations();
  }, [
    baseResumeValidation.checked,
    demoMode,
    llmValidation.checked,
    requiresLlmKey,
    runValidations,
    rxresumeValidation.checked,
    settings,
    settingsLoading,
  ]);

  const complete = useMemo(() => {
    if (demoMode) return true;
    if (!settings) return false;

    const llmComplete = requiresLlmKey ? llmValidation.valid : true;
    const basicAuthComplete =
      settings.basicAuthActive || basicAuthDecision !== null;

    return (
      llmComplete &&
      rxresumeValidation.valid &&
      baseResumeValidation.valid &&
      basicAuthComplete
    );
  }, [
    baseResumeValidation.valid,
    basicAuthDecision,
    demoMode,
    llmValidation.valid,
    requiresLlmKey,
    rxresumeValidation.valid,
    settings,
  ]);

  const checking =
    !demoMode &&
    (settingsLoading ||
      !settings ||
      (requiresLlmKey && !llmValidation.checked) ||
      !rxresumeValidation.checked ||
      !baseResumeValidation.checked);

  return {
    checking,
    complete,
  };
}
