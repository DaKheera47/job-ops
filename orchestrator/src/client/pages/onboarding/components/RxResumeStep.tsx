import { BaseResumeSelection } from "@client/pages/settings/components/BaseResumeSelection";
import { SettingsInput } from "@client/pages/settings/components/SettingsInput";
import type React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import type { ValidationState } from "../types";
import { InlineValidation } from "./InlineValidation";

export const RxResumeStep: React.FC<{
  baseResumeValue: string | null;
  isBusy: boolean;
  isResumeReady: boolean;
  isSelfHosted: boolean;
  rxresumeApiKey: string;
  rxresumeUrl: string;
  rxresumeValidation: ValidationState;
  rxresumeApiKeyHint: string | null | undefined;
  onTemplateResumeChange: (value: string | null) => void;
  onSelfHostedChange: (next: boolean) => void;
  onRxresumeApiKeyChange: (value: string) => void;
  onRxresumeUrlChange: (value: string) => void;
}> = ({
  baseResumeValue,
  isBusy,
  isResumeReady,
  isSelfHosted,
  onTemplateResumeChange,
  onRxresumeApiKeyChange,
  onRxresumeUrlChange,
  onSelfHostedChange,
  rxresumeApiKey,
  rxresumeApiKeyHint,
  rxresumeUrl,
  rxresumeValidation,
}) => (
  <div className="space-y-6">
    <div className="space-y-5">
      <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
        Use Reactive Resume if your current resume already lives there. Once
        connected, choose one of your existing resumes to import into Job Ops.
      </div>

      <SettingsInput
        label="v5 API key"
        inputProps={{
          name: "rxresumeApiKey",
          value: rxresumeApiKey,
          onChange: (event) =>
            onRxresumeApiKeyChange(event.currentTarget.value),
        }}
        type="password"
        placeholder="Enter v5 API key"
        helper={
          rxresumeApiKeyHint
            ? "Leave blank to keep the saved v5 API key."
            : undefined
        }
        disabled={isBusy}
      />

      <div className="rounded-lg border border-border/60 bg-muted/10 px-4 py-3">
        <label
          htmlFor="rxresume-self-hosted"
          className="flex cursor-pointer items-start gap-3"
        >
          <Checkbox
            id="rxresume-self-hosted"
            checked={isSelfHosted}
            onCheckedChange={(checked) => onSelfHostedChange(Boolean(checked))}
            disabled={isBusy}
          />
          <div className="space-y-1">
            <div className="text-sm font-medium">
              Self-hosted Reactive Resume?
            </div>
            <p className="text-xs text-muted-foreground">
              Turn this on only if you run your own instance and need a custom
              base URL.
            </p>
          </div>
        </label>
      </div>

      {isSelfHosted ? (
        <SettingsInput
          label="Custom URL"
          inputProps={{
            name: "rxresumeUrl",
            value: rxresumeUrl,
            onChange: (event) => onRxresumeUrlChange(event.currentTarget.value),
          }}
          type="url"
          placeholder="https://resume.example.com"
          helper="Enter the root URL for your self-hosted Reactive Resume instance."
          disabled={isBusy}
        />
      ) : null}

      {rxresumeValidation.valid ? (
        <div className="space-y-3 rounded-lg border border-border/60 bg-background/70 p-4">
          <div className="space-y-1">
            <div className="text-sm font-medium">Template resume</div>
            <p className="text-xs text-muted-foreground">
              Choose the resume Job Ops should treat as your imported base
              resume for this onboarding step.
            </p>
          </div>
          <BaseResumeSelection
            value={baseResumeValue}
            onValueChange={onTemplateResumeChange}
            hasRxResumeAccess={rxresumeValidation.valid}
            disabled={isBusy}
          />
          {isResumeReady ? (
            <div className="text-xs text-muted-foreground">
              You already have a usable resume source, so this selection stays
              optional.
            </div>
          ) : null}
        </div>
      ) : null}
    </div>

    <InlineValidation
      state={rxresumeValidation}
      successMessage="Reactive Resume connection verified."
    />
  </div>
);
