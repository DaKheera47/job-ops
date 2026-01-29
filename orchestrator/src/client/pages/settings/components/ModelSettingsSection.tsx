import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type { ModelValues } from "@client/pages/settings/types";
import { formatSecretHint } from "@client/pages/settings/utils";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import type React from "react";
import { useEffect } from "react";
import { Controller, useFormContext } from "react-hook-form";
import {
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

type ModelSettingsSectionProps = {
  values: ModelValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const ModelSettingsSection: React.FC<ModelSettingsSectionProps> = ({
  values,
  isLoading,
  isSaving,
}) => {
  const {
    effective,
    default: defaultModel,
    scorer,
    tailoring,
    projectSelection,
    llmProvider,
    llmBaseUrl,
    llmApiKeyHint,
  } = values;
  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();

  const selectedProvider = watch("llmProvider") || llmProvider || "openrouter";
  const normalizedProvider = selectedProvider.toLowerCase();
  const showApiKey = ["openrouter", "openai", "gemini"].includes(
    normalizedProvider,
  );
  const showBaseUrl = ["lmstudio", "ollama"].includes(normalizedProvider);

  const baseUrlPlaceholder =
    normalizedProvider === "ollama"
      ? "http://localhost:11434"
      : "http://localhost:1234";

  const baseUrlHelper =
    normalizedProvider === "ollama"
      ? "Default: http://localhost:11434"
      : "Default: http://localhost:1234";

  const providerHint =
    normalizedProvider === "ollama"
      ? "Ollama typically runs locally and does not require an API key."
      : normalizedProvider === "lmstudio"
        ? "LM Studio runs locally via its OpenAI-compatible server."
        : normalizedProvider === "openai"
          ? "OpenAI uses the Responses API with structured outputs."
          : normalizedProvider === "gemini"
            ? "Gemini uses the native AI Studio API and requires a key."
            : "OpenRouter uses your API key and supports model routing across providers.";

  useEffect(() => {
    if (showBaseUrl) return;
    const currentValue = watch("llmBaseUrl");
    if (currentValue) {
      setValue("llmBaseUrl", "", { shouldDirty: true });
    }
  }, [setValue, showBaseUrl, watch]);

  const keyHint = formatSecretHint(llmApiKeyHint);
  const keyText = showApiKey ? keyHint || "Not set" : "Not required";
  const effectiveDefaultModel = effective || defaultModel || "—";
  const scoringModel = scorer || effectiveDefaultModel;
  const tailoringModel = tailoring || effectiveDefaultModel;
  const projectSelectionModel = projectSelection || effectiveDefaultModel;
  const overrideSegments = [
    scoringModel !== effectiveDefaultModel ? `scoring ${scoringModel}` : null,
    tailoringModel !== effectiveDefaultModel
      ? `tailoring ${tailoringModel}`
      : null,
    projectSelectionModel !== effectiveDefaultModel
      ? `project selection ${projectSelectionModel}`
      : null,
  ].filter(Boolean);

  return (
    <AccordionItem value="model" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Model</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-4">
          <div className="space-y-4">
            <div className="text-sm font-medium">LLM Provider</div>
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
                      value={field.value ?? ""}
                      onValueChange={(value) => field.onChange(value)}
                      disabled={isLoading || isSaving}
                    >
                      <SelectTrigger id="llmProvider">
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openrouter">OpenRouter</SelectItem>
                        <SelectItem value="lmstudio">LM Studio</SelectItem>
                        <SelectItem value="ollama">Ollama</SelectItem>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="gemini">Gemini</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.llmProvider?.message && (
                  <p className="text-xs text-destructive">
                    {errors.llmProvider.message as string}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Used for scoring, tailoring, and extraction.
                </p>
                <p className="text-xs text-muted-foreground">{providerHint}</p>
              </div>
              {showBaseUrl && (
                <SettingsInput
                  label="LLM base URL"
                  inputProps={register("llmBaseUrl")}
                  placeholder={baseUrlPlaceholder}
                  disabled={isLoading || isSaving}
                  error={errors.llmBaseUrl?.message as string | undefined}
                  helper={baseUrlHelper}
                  current={llmBaseUrl || "—"}
                />
              )}
              {showApiKey && (
                <SettingsInput
                  label="LLM API key"
                  inputProps={register("llmApiKey")}
                  type="password"
                  placeholder="Enter new key"
                  disabled={isLoading || isSaving}
                  error={errors.llmApiKey?.message as string | undefined}
                  current={keyHint}
                />
              )}
            </div>
          </div>

          <Separator />

          <SettingsInput
            label="Default model"
            inputProps={register("model")}
            placeholder={defaultModel || "google/gemini-3-flash-preview"}
            disabled={isLoading || isSaving}
            error={errors.model?.message as string | undefined}
            helper="Leave blank to use the default from server env (`MODEL`)."
            current={effectiveDefaultModel}
          />

          <Separator />

          <div className="space-y-4">
            <div className="text-sm font-medium">Task-Specific Overrides</div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <SettingsInput
                label="Scoring Model"
                inputProps={register("modelScorer")}
                placeholder={effective || "inherit"}
                disabled={isLoading || isSaving}
                error={errors.modelScorer?.message as string | undefined}
                current={scoringModel}
              />

              <SettingsInput
                label="Tailoring Model"
                inputProps={register("modelTailoring")}
                placeholder={effective || "inherit"}
                disabled={isLoading || isSaving}
                error={errors.modelTailoring?.message as string | undefined}
                current={tailoringModel}
              />

              <SettingsInput
                label="Project Selection Model"
                inputProps={register("modelProjectSelection")}
                placeholder={effective || "inherit"}
                disabled={isLoading || isSaving}
                error={
                  errors.modelProjectSelection?.message as string | undefined
                }
                current={projectSelectionModel}
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-3 text-sm">
            <div className="text-xs text-muted-foreground">Resolved config</div>
            <div className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-[160px_1fr]">
              <div className="text-muted-foreground">Provider</div>
              <div className="font-mono">{selectedProvider || "—"}</div>

              <div className="text-muted-foreground">Base URL</div>
              <div className="font-mono">{llmBaseUrl || "—"}</div>

              <div className="text-muted-foreground">API key</div>
              <div className="font-mono">{keyText}</div>

              <div className="text-muted-foreground">Default model</div>
              <div className="font-mono">{effectiveDefaultModel}</div>

              <div className="text-muted-foreground">Scoring model</div>
              <div className="font-mono">
                {scoringModel === effectiveDefaultModel
                  ? "inherits"
                  : scoringModel}
              </div>

              <div className="text-muted-foreground">Tailoring model</div>
              <div className="font-mono">
                {tailoringModel === effectiveDefaultModel
                  ? "inherits"
                  : tailoringModel}
              </div>

              <div className="text-muted-foreground">Project selection</div>
              <div className="font-mono">
                {projectSelectionModel === effectiveDefaultModel
                  ? "inherits"
                  : projectSelectionModel}
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
