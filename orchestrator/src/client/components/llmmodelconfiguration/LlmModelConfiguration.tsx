import * as api from "@client/api";
import { CodexAuthPanel } from "@client/components/CodexAuthPanel";
import { GeminiCliSetupHint } from "@client/components/GeminiCliSetupHint";
import PurposeOverrideCard from "@client/components/llmmodelconfiguration/PurposeOverrideCard";
import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import {
  formatSecretHint,
  getLlmProviderConfig,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDERS,
  type LlmProviderId,
  supportsLlmModelSuggestions,
} from "@client/pages/settings/utils";
import { getDefaultModelForProvider } from "@shared/settings-registry";
import type {
  LlmPurpose,
  LlmPurposeApiKeyHints,
  LlmPurposeOverrides,
} from "@shared/types";
import type React from "react";
import { useDeferredValue, useEffect, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  buildModelOptions,
  LLM_PURPOSES,
  renderKeyHelper,
} from "./llm-model-configuration-helpers";
import ModelField from "./ModelField";

type TextFieldBinding = {
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

type PurposeOverrideBinding = {
  values: LlmPurposeOverrides;
  apiKeys: Partial<Record<LlmPurpose, string | null>>;
  apiKeyHints: LlmPurposeApiKeyHints;
  models: Record<LlmPurpose, string>;
  onChange: (
    purpose: LlmPurpose,
    field: "provider" | "baseUrl" | "model",
    value: string | null,
  ) => void;
  onApiKeyChange: (purpose: LlmPurpose, value: string) => void;
};

type LlmModelConfigurationProps = {
  mode: "compact" | "settings";
  disabled: boolean;
  selectedProvider: LlmProviderId;
  savedProvider?: string | null;
  savedBaseUrl?: string | null;
  apiKeyHint?: string | null;
  effectiveModel?: string | null;
  defaultModel?: string | null;
  provider: TextFieldBinding;
  baseUrl: TextFieldBinding;
  apiKey: TextFieldBinding;
  model: TextFieldBinding;
  modelScorer?: TextFieldBinding;
  modelTailoring?: TextFieldBinding;
  modelProjectSelection?: TextFieldBinding;
  purposeOverrides?: PurposeOverrideBinding;
  validationSlot?: React.ReactNode;
};

export function LlmModelConfiguration({
  mode,
  disabled,
  selectedProvider,
  savedProvider,
  savedBaseUrl,
  apiKeyHint,
  effectiveModel,
  defaultModel,
  provider,
  baseUrl,
  apiKey,
  model,
  modelScorer,
  modelTailoring,
  modelProjectSelection,
  purposeOverrides,
  validationSlot,
}: LlmModelConfigurationProps) {
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const providerConfig = getLlmProviderConfig(selectedProvider);
  const { showApiKey, showBaseUrl } = providerConfig;
  const isCodexProvider = providerConfig.normalizedProvider === "codex";
  const isGeminiCliProvider =
    providerConfig.normalizedProvider === "gemini_cli";
  const deferredProvider = useDeferredValue(selectedProvider);
  const deferredBaseUrl = useDeferredValue(baseUrl.value);
  const deferredApiKey = useDeferredValue(apiKey.value);
  const supportsModelSuggestions =
    supportsLlmModelSuggestions(selectedProvider);
  const hasAvailableApiKey = showApiKey
    ? Boolean(deferredApiKey.trim() || apiKeyHint)
    : true;
  const providerDefaultModel = getDefaultModelForProvider(
    selectedProvider,
    selectedProvider === savedProvider
      ? (defaultModel ?? undefined)
      : undefined,
  );

  useEffect(() => {
    if (showBaseUrl) return;
    if (baseUrl.value) {
      baseUrl.onChange("");
    }
  }, [baseUrl, showBaseUrl]);

  useEffect(() => {
    if (!supportsModelSuggestions) {
      setAvailableModels([]);
      setModelsError(null);
      setIsLoadingModels(false);
      return;
    }

    if (!hasAvailableApiKey) {
      setAvailableModels([]);
      setModelsError(null);
      setIsLoadingModels(false);
      return;
    }

    let cancelled = false;
    setIsLoadingModels(true);
    setModelsError(null);

    void api
      .getLlmModels({
        provider: deferredProvider,
        baseUrl: showBaseUrl ? deferredBaseUrl.trim() || undefined : undefined,
        apiKey: showApiKey ? deferredApiKey.trim() || undefined : undefined,
      })
      .then((models) => {
        if (cancelled) return;
        setAvailableModels(models);
        setModelsError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setAvailableModels([]);
        setModelsError(
          error instanceof Error ? error.message : "Failed to load models.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoadingModels(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    deferredApiKey,
    deferredBaseUrl,
    deferredProvider,
    hasAvailableApiKey,
    showApiKey,
    showBaseUrl,
    supportsModelSuggestions,
  ]);

  const handleProviderChange = (value: string) => {
    provider.onChange(value);
    model.onChange("");
    modelScorer?.onChange("");
    modelTailoring?.onChange("");
    modelProjectSelection?.onChange("");
  };

  const formattedKeyHint = formatSecretHint(apiKeyHint ?? null);
  const hasSavedKey = Boolean(apiKeyHint);
  const keyText = showApiKey ? formattedKeyHint : "Not required";
  const resolvedBaseUrl = baseUrl.value.trim() || savedBaseUrl || "-";
  const selectedDefaultModel = model.value.trim();
  const previewDefaultModel =
    selectedDefaultModel || effectiveModel || providerDefaultModel || "-";
  const selectedScoringModel = modelScorer?.value.trim() ?? "";
  const selectedTailoringModel = modelTailoring?.value.trim() ?? "";
  const selectedProjectSelectionModel =
    modelProjectSelection?.value.trim() ?? "";
  const scoringModel = selectedScoringModel || previewDefaultModel;
  const tailoringModel = selectedTailoringModel || previewDefaultModel;
  const projectSelectionModel =
    selectedProjectSelectionModel || previewDefaultModel;
  const modelHelper = supportsModelSuggestions
    ? !hasAvailableApiKey
      ? `Add or save a ${providerConfig.label} API key to load available models.`
      : isLoadingModels
        ? "Loading available models..."
        : modelsError
          ? modelsError
          : availableModels.length > 0
            ? "Choose from the available text-generation models."
            : "No text-generation models were returned."
    : `Type the exact model name manually, or leave blank to use the ${providerConfig.label} default model.`;
  const defaultModelOptions = buildModelOptions({
    models: availableModels,
    emptyLabel: `Use ${providerConfig.label} default`,
    emptyValue: "",
    fallbackValue: model.value.trim(),
  });
  const scoringModelOptions = buildModelOptions({
    models: availableModels,
    emptyLabel: "Inherit default model",
    emptyValue: "",
    fallbackValue: modelScorer?.value.trim(),
  });
  const tailoringModelOptions = buildModelOptions({
    models: availableModels,
    emptyLabel: "Inherit default model",
    emptyValue: "",
    fallbackValue: modelTailoring?.value.trim(),
  });
  const projectSelectionModelOptions = buildModelOptions({
    models: availableModels,
    emptyLabel: "Inherit default model",
    emptyValue: "",
    fallbackValue: modelProjectSelection?.value.trim(),
  });
  const providerGridClass =
    mode === "compact"
      ? "grid gap-5 lg:grid-cols-2"
      : "grid gap-4 md:grid-cols-2";
  const providerHintClass =
    mode === "compact"
      ? "text-sm text-muted-foreground"
      : "text-xs text-muted-foreground";

  return (
    <>
      <div className={mode === "compact" ? "space-y-6" : "space-y-4"}>
        <div className="space-y-4">
          {mode === "settings" ? (
            <div className="text-sm font-medium">LLM Provider</div>
          ) : null}
          <div className={providerGridClass}>
            <div className="space-y-2">
              <label htmlFor="llmProvider" className="text-sm font-medium">
                Provider
              </label>
              <Select
                value={selectedProvider}
                onValueChange={handleProviderChange}
                disabled={disabled}
              >
                <SelectTrigger
                  id="llmProvider"
                  className={mode === "compact" ? "h-10" : undefined}
                >
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  {LLM_PROVIDERS.map((llmProvider) => (
                    <SelectItem key={llmProvider} value={llmProvider}>
                      {LLM_PROVIDER_LABELS[llmProvider]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {provider.error ? (
                <p className="text-xs text-destructive">{provider.error}</p>
              ) : null}
              {mode === "settings" ? (
                <p className="text-xs text-muted-foreground">
                  Used for scoring, tailoring, and extraction.
                </p>
              ) : null}
              <p className={providerHintClass}>{providerConfig.providerHint}</p>
            </div>
            {isCodexProvider ? <CodexAuthPanel isBusy={disabled} /> : null}
            {isGeminiCliProvider ? <GeminiCliSetupHint /> : null}
            {showBaseUrl ? (
              <SettingsInput
                label={mode === "compact" ? "Base URL" : "LLM base URL"}
                inputProps={{
                  name: "llmBaseUrl",
                  value: baseUrl.value,
                  onChange: (event) => baseUrl.onChange(event.target.value),
                }}
                placeholder={providerConfig.baseUrlPlaceholder}
                disabled={disabled}
                error={baseUrl.error}
                helper={providerConfig.baseUrlHelper}
                current={mode === "settings" ? resolvedBaseUrl : undefined}
              />
            ) : null}
            {showApiKey ? (
              <SettingsInput
                label={mode === "compact" ? "API key" : "LLM API key"}
                inputProps={{
                  name: "llmApiKey",
                  value: apiKey.value,
                  onChange: (event) => apiKey.onChange(event.target.value),
                }}
                type="password"
                placeholder={
                  mode === "compact" ? "Paste a new key" : "Enter new key"
                }
                disabled={disabled}
                error={apiKey.error}
                helper={renderKeyHelper(
                  providerConfig.keyHelperText,
                  providerConfig.keyHelperHref,
                  hasSavedKey,
                )}
                current={mode === "settings" ? formattedKeyHint : undefined}
              />
            ) : mode === "compact" ? (
              <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                No API key is required for this provider.
              </div>
            ) : null}
          </div>
        </div>

        {mode === "compact" ? validationSlot : null}
      </div>

      <Separator />

      <ModelField
        id="model"
        label="Default model"
        value={model.value}
        onChange={model.onChange}
        error={model.error}
        supportsModelSuggestions={supportsModelSuggestions}
        options={defaultModelOptions}
        placeholder={providerDefaultModel || "Select a model"}
        helper={modelHelper}
        current={previewDefaultModel}
        disabled={disabled || isLoadingModels}
      />

      {mode === "settings" ? (
        <>
          <Separator />

          <div>
            <div className="font-medium mt-8">
              Purpose-specific model overrides
            </div>
            <div className="space-y-4">
              {purposeOverrides ? (
                <Accordion type="single" collapsible>
                  {LLM_PURPOSES.map((purpose) => (
                    <AccordionItem key={purpose.id} value={purpose.id}>
                      <AccordionTrigger>
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-medium text-sm">
                            {purpose.label}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {purpose.description}
                          </span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <PurposeOverrideCard
                          key={purpose.id}
                          purpose={purpose.id}
                          defaultProvider={selectedProvider}
                          defaultModel={previewDefaultModel}
                          defaultBaseUrl={resolvedBaseUrl}
                          defaultApiKeyHint={apiKeyHint ?? null}
                          value={purposeOverrides.values[purpose.id]}
                          apiKeyValue={
                            purposeOverrides.apiKeys[purpose.id] ?? ""
                          }
                          apiKeyHint={
                            purposeOverrides.apiKeyHints[purpose.id] ?? null
                          }
                          currentModel={purposeOverrides.models[purpose.id]}
                          disabled={disabled}
                          onChange={purposeOverrides.onChange}
                          onApiKeyChange={purposeOverrides.onApiKeyChange}
                        />
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <ModelField
                    id="modelScorer"
                    label="Scoring Model"
                    value={modelScorer?.value ?? ""}
                    onChange={(value) => modelScorer?.onChange(value)}
                    error={modelScorer?.error}
                    supportsModelSuggestions={supportsModelSuggestions}
                    options={scoringModelOptions}
                    placeholder={previewDefaultModel || "Inherit default model"}
                    current={scoringModel}
                    disabled={disabled || isLoadingModels}
                  />
                  <ModelField
                    id="modelTailoring"
                    label="Tailoring Model"
                    value={modelTailoring?.value ?? ""}
                    onChange={(value) => modelTailoring?.onChange(value)}
                    error={modelTailoring?.error}
                    supportsModelSuggestions={supportsModelSuggestions}
                    options={tailoringModelOptions}
                    placeholder={previewDefaultModel || "Inherit default model"}
                    current={tailoringModel}
                    disabled={disabled || isLoadingModels}
                  />
                  <ModelField
                    id="modelProjectSelection"
                    label="Project Selection Model"
                    value={modelProjectSelection?.value ?? ""}
                    onChange={(value) => modelProjectSelection?.onChange(value)}
                    error={modelProjectSelection?.error}
                    supportsModelSuggestions={supportsModelSuggestions}
                    options={projectSelectionModelOptions}
                    placeholder={previewDefaultModel || "Inherit default model"}
                    current={projectSelectionModel}
                    disabled={disabled || isLoadingModels}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div className="text-xs text-muted-foreground">Resolved config</div>
            <div className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[160px_1fr]">
              <div className="text-muted-foreground">Provider</div>
              <div className="font-mono">{selectedProvider || "-"}</div>

              <div className="text-muted-foreground">Base URL</div>
              <div className="font-mono">{resolvedBaseUrl}</div>

              <div className="text-muted-foreground">API key</div>
              <div className="font-mono">{keyText}</div>

              <div className="text-muted-foreground">Default model</div>
              <div className="font-mono">{previewDefaultModel}</div>

              <div className="text-muted-foreground">Scoring model</div>
              <div className="font-mono">
                {selectedScoringModel ? scoringModel : "inherits"}
              </div>

              <div className="text-muted-foreground">Tailoring model</div>
              <div className="font-mono">
                {selectedTailoringModel ? tailoringModel : "inherits"}
              </div>

              <div className="text-muted-foreground">Project selection</div>
              <div className="font-mono">
                {selectedProjectSelectionModel
                  ? projectSelectionModel
                  : "inherits"}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
