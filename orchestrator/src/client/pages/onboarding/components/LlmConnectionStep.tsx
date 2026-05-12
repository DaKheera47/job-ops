import { LlmModelConfiguration } from "@client/components/llmmodelconfiguration/LlmModelConfiguration";
import {
  getLlmProviderConfig,
  type LlmProviderId,
} from "@client/pages/settings/utils";
import type React from "react";
import type { ValidationState } from "../types";
import { InlineValidation } from "./InlineValidation";

export const LlmConnectionStep: React.FC<{
  apiKey: string;
  baseUrl: string;
  defaultModel: string | null | undefined;
  effectiveModel: string | null | undefined;
  isBusy: boolean;
  llmKeyHint: string | null;
  model: string;
  savedBaseUrl: string | null | undefined;
  savedProvider: string | null | undefined;
  selectedProvider: LlmProviderId;
  validation: ValidationState;
  onApiKeyChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onModelChange: (value: string) => void;
  onProviderChange: (value: string) => void;
}> = ({
  apiKey,
  baseUrl,
  defaultModel,
  effectiveModel,
  isBusy,
  llmKeyHint,
  model,
  savedBaseUrl,
  savedProvider,
  selectedProvider,
  validation,
  onApiKeyChange,
  onBaseUrlChange,
  onModelChange,
  onProviderChange,
}) => {
  const providerConfig = getLlmProviderConfig(selectedProvider);

  return (
    <LlmModelConfiguration
      mode="compact"
      disabled={isBusy}
      selectedProvider={selectedProvider}
      savedProvider={savedProvider}
      savedBaseUrl={savedBaseUrl}
      apiKeyHint={llmKeyHint}
      effectiveModel={effectiveModel}
      defaultModel={defaultModel}
      provider={{
        value: selectedProvider,
        onChange: onProviderChange,
      }}
      baseUrl={{
        value: baseUrl,
        onChange: onBaseUrlChange,
      }}
      apiKey={{
        value: apiKey,
        onChange: onApiKeyChange,
      }}
      model={{
        value: model,
        onChange: onModelChange,
      }}
      validationSlot={
        <InlineValidation
          state={validation}
          successMessage={`${providerConfig.label} connection verified.`}
        />
      }
    />
  );
};
