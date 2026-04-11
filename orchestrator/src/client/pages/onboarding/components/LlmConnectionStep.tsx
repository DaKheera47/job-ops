import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import {
  getLlmProviderConfig,
  LLM_PROVIDER_LABELS,
  LLM_PROVIDERS,
  type LlmProviderId,
} from "@client/pages/settings/utils";
import type React from "react";
import { type Control, Controller } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OnboardingFormData, ValidationState } from "../types";
import { InlineValidation } from "./InlineValidation";

function renderKeyHelper(
  helperText: string,
  helperHref: string | null,
  keepSavedKey: boolean,
) {
  return (
    <>
      {helperHref ? (
        <a
          href={helperHref}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-border underline-offset-4 transition-colors hover:text-foreground"
        >
          {helperText}
        </a>
      ) : (
        helperText
      )}
      {keepSavedKey ? ". Leave blank to keep the saved key." : null}
    </>
  );
}

export const LlmConnectionStep: React.FC<{
  control: Control<OnboardingFormData>;
  isBusy: boolean;
  llmKeyHint: string | null;
  selectedProvider: LlmProviderId;
  validation: ValidationState;
}> = ({ control, isBusy, llmKeyHint, selectedProvider, validation }) => {
  const providerConfig = getLlmProviderConfig(selectedProvider);
  const { showApiKey, showBaseUrl } = providerConfig;

  return (
    <div className="space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
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
                onValueChange={(value) => field.onChange(value)}
                disabled={isBusy}
              >
                <SelectTrigger id="llmProvider" className="h-10">
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
          <p className="text-sm text-muted-foreground">
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
        ) : null}
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
                helper={renderKeyHelper(
                  providerConfig.keyHelperText,
                  providerConfig.keyHelperHref,
                  Boolean(llmKeyHint),
                )}
                disabled={isBusy}
              />
            )}
          />
        ) : (
          <div className="rounded-lg border border-dashed border-border/60 bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
            No API key is required for this provider. Job Ops will only validate
            the local endpoint details.
          </div>
        )}
      </div>

      <InlineValidation state={validation} />
    </div>
  );
};
