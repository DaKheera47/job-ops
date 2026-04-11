import type { LlmProviderId } from "@client/pages/settings/utils";
import type { PdfRenderer } from "@shared/types.js";
import type React from "react";
import type { Control } from "react-hook-form";
import type {
  BasicAuthChoice,
  OnboardingFormData,
  StepId,
  ValidationState,
} from "../types";
import { BaseResumeStep } from "./BaseResumeStep";
import { BasicAuthStep } from "./BasicAuthStep";
import { LlmConnectionStep } from "./LlmConnectionStep";
import { RxResumeStep } from "./RxResumeStep";

export const OnboardingStepContent: React.FC<{
  baseResumeValidation: ValidationState;
  basicAuthChoice: BasicAuthChoice;
  basicAuthPassword: string;
  basicAuthUser: string;
  control: Control<OnboardingFormData>;
  currentStep: StepId;
  isBusy: boolean;
  isRxResumeSelfHosted: boolean;
  llmKeyHint: string | null;
  llmValidation: ValidationState;
  pdfRenderer: PdfRenderer;
  rxresumeApiKey: string;
  rxresumeApiKeyHint: string | null | undefined;
  rxresumeUrl: string;
  rxresumeValidation: ValidationState;
  selectedProvider: LlmProviderId;
  templateResumeId: string | null;
  onBasicAuthChoiceChange: (choice: BasicAuthChoice) => void;
  onBasicAuthPasswordChange: (value: string) => void;
  onBasicAuthUserChange: (value: string) => void;
  onPdfRendererChange: (renderer: PdfRenderer) => void;
  onRxresumeApiKeyChange: (value: string) => void;
  onRxresumeSelfHostedChange: (next: boolean) => void;
  onRxresumeUrlChange: (value: string) => void;
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

  if (props.currentStep === "rxresume") {
    return (
      <RxResumeStep
        isBusy={props.isBusy}
        isSelfHosted={props.isRxResumeSelfHosted}
        pdfRenderer={props.pdfRenderer}
        rxresumeApiKey={props.rxresumeApiKey}
        rxresumeApiKeyHint={props.rxresumeApiKeyHint}
        rxresumeUrl={props.rxresumeUrl}
        rxresumeValidation={props.rxresumeValidation}
        onSelfHostedChange={props.onRxresumeSelfHostedChange}
        onPdfRendererChange={props.onPdfRendererChange}
        onRxresumeApiKeyChange={props.onRxresumeApiKeyChange}
        onRxresumeUrlChange={props.onRxresumeUrlChange}
      />
    );
  }

  if (props.currentStep === "baseresume") {
    return (
      <BaseResumeStep
        baseResumeValidation={props.baseResumeValidation}
        hasRxResumeAccess={props.rxresumeValidation.valid}
        isBusy={props.isBusy}
        value={props.templateResumeId}
        onValueChange={props.onTemplateResumeChange}
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
