import { LlmModelConfiguration } from "@client/components/LlmModelConfiguration";
import { SettingsSectionFrame } from "@client/pages/settings/components/SettingsSectionFrame";
import type { ModelValues } from "@client/pages/settings/types";
import {
  type LlmProviderId,
  normalizeLlmProvider,
} from "@client/pages/settings/utils";
import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type React from "react";
import { useFormContext } from "react-hook-form";

type ModelSettingsSectionProps = {
  values: ModelValues;
  isLoading: boolean;
  isSaving: boolean;
  layoutMode?: "accordion" | "panel";
};

export const ModelSettingsSection: React.FC<ModelSettingsSectionProps> = ({
  values,
  isLoading,
  isSaving,
  layoutMode,
}) => {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();
  const selectedProvider = normalizeLlmProvider(
    watch("llmProvider") || values.llmProvider || "openrouter",
  );
  const disabled = isLoading || isSaving;

  const setStringField = (
    field: keyof Pick<
      UpdateSettingsInput,
      | "llmBaseUrl"
      | "llmApiKey"
      | "model"
      | "modelScorer"
      | "modelTailoring"
      | "modelProjectSelection"
    >,
    value: string,
  ) => {
    setValue(field, value, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <SettingsSectionFrame mode={layoutMode} title="Model" value="model">
      <LlmModelConfiguration
        mode="settings"
        disabled={disabled}
        selectedProvider={selectedProvider}
        savedProvider={values.llmProvider}
        savedBaseUrl={values.llmBaseUrl}
        apiKeyHint={values.llmApiKeyHint}
        effectiveModel={values.effective}
        defaultModel={values.default}
        provider={{
          value: selectedProvider,
          onChange: (value) =>
            setValue("llmProvider", value as LlmProviderId, {
              shouldDirty: true,
              shouldValidate: true,
            }),
          error: errors.llmProvider?.message as string | undefined,
        }}
        baseUrl={{
          value: watch("llmBaseUrl") ?? "",
          onChange: (value) => setStringField("llmBaseUrl", value),
          error: errors.llmBaseUrl?.message as string | undefined,
        }}
        apiKey={{
          value: watch("llmApiKey") ?? "",
          onChange: (value) => setStringField("llmApiKey", value),
          error: errors.llmApiKey?.message as string | undefined,
        }}
        model={{
          value: watch("model") ?? "",
          onChange: (value) => setStringField("model", value),
          error: errors.model?.message as string | undefined,
        }}
        modelScorer={{
          value: watch("modelScorer") ?? "",
          onChange: (value) => setStringField("modelScorer", value),
          error: errors.modelScorer?.message as string | undefined,
        }}
        modelTailoring={{
          value: watch("modelTailoring") ?? "",
          onChange: (value) => setStringField("modelTailoring", value),
          error: errors.modelTailoring?.message as string | undefined,
        }}
        modelProjectSelection={{
          value: watch("modelProjectSelection") ?? "",
          onChange: (value) => setStringField("modelProjectSelection", value),
          error: errors.modelProjectSelection?.message as string | undefined,
        }}
      />
    </SettingsSectionFrame>
  );
};
