import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type { EnvSettingsValues } from "@client/pages/settings/types";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";

type EnvironmentSettingsSectionProps = {
  values: EnvSettingsValues;
  isLoading: boolean;
  isSaving: boolean;
};

export const EnvironmentSettingsSection: React.FC<
  EnvironmentSettingsSectionProps
> = ({ values, isLoading, isSaving }) => {
  const {
    register,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<UpdateSettingsInput>();
  const { private: privateValues } = values;

  const isBasicAuthEnabled = watch("enableBasicAuth");
  const selectedProvider =
    watch("llmProvider") || values.readable.llmProvider || "openrouter";
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

  return (
    <AccordionItem value="environment" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline py-4">
        <span className="text-base font-semibold">Environment & Accounts</span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">
        <div className="space-y-8">
          {/* External Services */}
          <div className="space-y-4">
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              External Services
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label htmlFor="llmProvider" className="text-sm font-medium">
                  LLM provider
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
                <p className="text-xs text-muted-foreground">
                  Current:{" "}
                  <span className="font-mono">
                    {values.readable.llmProvider || "—"}
                  </span>
                </p>
              </div>
              {showBaseUrl && (
                <SettingsInput
                  label="LLM base URL"
                  inputProps={register("llmBaseUrl")}
                  placeholder={baseUrlPlaceholder}
                  disabled={isLoading || isSaving}
                  error={errors.llmBaseUrl?.message as string | undefined}
                  helper={baseUrlHelper}
                  current={values.readable.llmBaseUrl}
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
                  current={formatSecretHint(privateValues.llmApiKeyHint)}
                />
              )}
            </div>
          </div>

          <Separator />

          {/* Service Accounts */}
          <div className="space-y-6">
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Service Accounts
            </div>

            <div className="space-y-4">
              <div className="text-sm font-semibold">RxResume</div>
              <div className="grid gap-4 md:grid-cols-2">
                <SettingsInput
                  label="Email"
                  inputProps={register("rxresumeEmail")}
                  placeholder="you@example.com"
                  disabled={isLoading || isSaving}
                  error={errors.rxresumeEmail?.message as string | undefined}
                />
                <SettingsInput
                  label="Password"
                  inputProps={register("rxresumePassword")}
                  type="password"
                  placeholder="Enter new password"
                  disabled={isLoading || isSaving}
                  error={errors.rxresumePassword?.message as string | undefined}
                  current={formatSecretHint(privateValues.rxresumePasswordHint)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-sm font-semibold">UKVisaJobs</div>
              <div className="grid gap-4 md:grid-cols-2">
                <SettingsInput
                  label="Email"
                  inputProps={register("ukvisajobsEmail")}
                  placeholder="you@example.com"
                  disabled={isLoading || isSaving}
                  error={errors.ukvisajobsEmail?.message as string | undefined}
                />
                <SettingsInput
                  label="Password"
                  inputProps={register("ukvisajobsPassword")}
                  type="password"
                  placeholder="Enter new password"
                  disabled={isLoading || isSaving}
                  error={
                    errors.ukvisajobsPassword?.message as string | undefined
                  }
                  current={formatSecretHint(
                    privateValues.ukvisajobsPasswordHint,
                  )}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Security */}
          <div className="space-y-4">
            <div className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Security
            </div>
            <div className="flex items-start space-x-3">
              <Controller
                name="enableBasicAuth"
                control={control}
                render={({ field }) => (
                  <Checkbox
                    id="enableBasicAuth"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={isLoading || isSaving}
                  />
                )}
              />
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="enableBasicAuth"
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  Enable basic authentication
                </label>
                <p className="text-xs text-muted-foreground">
                  Require a username and password for write operations.
                </p>
              </div>
            </div>

            {isBasicAuthEnabled && (
              <div className="grid gap-4 md:grid-cols-2 pt-2">
                <SettingsInput
                  label="Username"
                  inputProps={register("basicAuthUser")}
                  placeholder="username"
                  disabled={isLoading || isSaving}
                  error={errors.basicAuthUser?.message as string | undefined}
                />

                <SettingsInput
                  label="Password"
                  inputProps={register("basicAuthPassword")}
                  type="password"
                  placeholder="Enter new password"
                  disabled={isLoading || isSaving}
                  error={
                    errors.basicAuthPassword?.message as string | undefined
                  }
                  current={formatSecretHint(
                    privateValues.basicAuthPasswordHint,
                  )}
                />
              </div>
            )}
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
