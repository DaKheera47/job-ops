import type { LlmProviderId } from "@client/pages/settings/utils";
import type React from "react";
import type { Control } from "react-hook-form";
import type {
  BasicAuthChoice,
  OnboardingFormData,
  ResumeSetupMode,
  StepId,
  ValidationState,
} from "../types";
import { BaseResumeStep } from "./BaseResumeStep";
import { BasicAuthStep } from "./BasicAuthStep";
import { LlmConnectionStep } from "./LlmConnectionStep";

export const OnboardingStepContent: React.FC<{
  baseResumeValidation: ValidationState;
  baseResumeValue: string | null;
  basicAuthChoice: BasicAuthChoice;
  basicAuthPassword: string;
  basicAuthUser: string;
  control: Control<OnboardingFormData>;
  currentStep: StepId;
  isBusy: boolean;
  isImportingResume: boolean;
  isResumeReady: boolean;
  isRxResumeSelfHosted: boolean;
  llmKeyHint: string | null;
  llmValidation: ValidationState;
  resumeSetupMode: ResumeSetupMode;
  rxresumeApiKey: string;
  rxresumeApiKeyHint: string | null | undefined;
  rxresumeUrl: string;
  rxresumeValidation: ValidationState;
  selectedProvider: LlmProviderId;
  onBasicAuthChoiceChange: (choice: BasicAuthChoice) => void;
  onBasicAuthPasswordChange: (value: string) => void;
  onBasicAuthUserChange: (value: string) => void;
  onImportResumeFile: (file: File) => Promise<void>;
  onRxresumeApiKeyChange: (value: string) => void;
  onRxresumeSelfHostedChange: (next: boolean) => void;
  onRxresumeUrlChange: (value: string) => void;
  onResumeSetupModeChange: (mode: ResumeSetupMode) => void;
  onTemplateResumeChange: (value: string | null) => void;
}> = (props) => {
  if (props.currentStep === "llm") {
    return (
      <LlmConnectionStep
        control={props.control}
        isBusy={props.isBusy}
        llmKeyHint={props.llmKeyHint}
        selectedProvider={props.selectedProvider}
        validation={props.llmValidation}
      />
    );
  }

  if (props.currentStep === "baseresume") {
    return (
      <BaseResumeStep
        baseResumeValidation={props.baseResumeValidation}
        baseResumeValue={props.baseResumeValue}
        hasRxResumeAccess={props.rxresumeValidation.valid}
        isBusy={props.isBusy}
        isImportingResume={props.isImportingResume}
        isResumeReady={props.isResumeReady}
        isRxResumeSelfHosted={props.isRxResumeSelfHosted}
        resumeSetupMode={props.resumeSetupMode}
        rxresumeApiKey={props.rxresumeApiKey}
        rxresumeApiKeyHint={props.rxresumeApiKeyHint}
        rxresumeUrl={props.rxresumeUrl}
        rxresumeValidation={props.rxresumeValidation}
        onImportResumeFile={props.onImportResumeFile}
        onResumeSetupModeChange={props.onResumeSetupModeChange}
        onRxresumeApiKeyChange={props.onRxresumeApiKeyChange}
        onRxresumeSelfHostedChange={props.onRxresumeSelfHostedChange}
        onRxresumeUrlChange={props.onRxresumeUrlChange}
        onTemplateResumeChange={props.onTemplateResumeChange}
      />
    );
  }

  return (
    <BasicAuthStep
      basicAuthChoice={props.basicAuthChoice}
      basicAuthPassword={props.basicAuthPassword}
      basicAuthUser={props.basicAuthUser}
      isBusy={props.isBusy}
      onBasicAuthChoiceChange={props.onBasicAuthChoiceChange}
      onBasicAuthPasswordChange={props.onBasicAuthPasswordChange}
      onBasicAuthUserChange={props.onBasicAuthUserChange}
    />
  );
};
