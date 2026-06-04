import type { LlmProviderId } from "@client/pages/settings/utils";
import type React from "react";
import type { ResumeSetupMode, StepId, ValidationState } from "../types";
import { BaseResumeStep } from "./BaseResumeStep";
import { LlmConnectionStep } from "./LlmConnectionStep";

export const OnboardingStepContent: React.FC<{
  baseResumeValidation: ValidationState;
  baseResumeValue: string | null;
  currentStep: StepId;
  defaultModel: string | null | undefined;
  effectiveModel: string | null | undefined;
  importingResumeFileName: string | null;
  isBusy: boolean;
  isImportingResume: boolean;
  isResumeReady: boolean;
  isRxResumeSelfHosted: boolean;
  llmApiKey: string;
  llmBaseUrl: string;
  llmKeyHint: string | null;
  model: string;
  llmValidation: ValidationState;
  resumeSetupMode: ResumeSetupMode;
  rxresumeApiKey: string;
  rxresumeApiKeyHint: string | null | undefined;
  rxresumeUrl: string;
  rxresumeValidation: ValidationState;
  savedBaseUrl: string | null | undefined;
  savedProvider: string | null | undefined;
  selectedProvider: LlmProviderId;
  onLlmApiKeyChange: (value: string) => void;
  onLlmBaseUrlChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onLlmProviderChange: (value: string) => void;
  onImportResumeFile: (file: File) => Promise<void>;
  onRxresumeApiKeyChange: (value: string) => void;
  onRxresumeSelfHostedChange: (next: boolean) => void;
  onRxresumeUrlChange: (value: string) => void;
  onResumeSetupModeChange: (mode: ResumeSetupMode) => void;
  onTemplateResumeChange: (value: string | null) => void;
}> = (props) => {
  if (props.currentStep === "model") {
    return (
      <LlmConnectionStep
        apiKey={props.llmApiKey}
        baseUrl={props.llmBaseUrl}
        defaultModel={props.defaultModel}
        effectiveModel={props.effectiveModel}
        isBusy={props.isBusy}
        llmKeyHint={props.llmKeyHint}
        model={props.model}
        savedBaseUrl={props.savedBaseUrl}
        savedProvider={props.savedProvider}
        selectedProvider={props.selectedProvider}
        validation={props.llmValidation}
        onApiKeyChange={props.onLlmApiKeyChange}
        onBaseUrlChange={props.onLlmBaseUrlChange}
        onModelChange={props.onLlmModelChange}
        onProviderChange={props.onLlmProviderChange}
      />
    );
  }

  if (props.currentStep === "resume") {
    const hasSavedRxResumeAccess = Boolean(props.rxresumeApiKeyHint);
    const hasRxResumeAccess =
      props.rxresumeValidation.valid || hasSavedRxResumeAccess;

    return (
      <BaseResumeStep
        baseResumeValidation={props.baseResumeValidation}
        baseResumeValue={props.baseResumeValue}
        hasRxResumeAccess={hasRxResumeAccess}
        importingResumeFileName={props.importingResumeFileName}
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

  return null;
};
