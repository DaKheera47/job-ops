import type { LlmProviderId } from "@client/pages/settings/utils";
import type { SearchTermsSuggestionResponse } from "@shared/types.js";
import type React from "react";
import type {
  BasicAuthChoice,
  ResumeSetupMode,
  StepId,
  ValidationState,
} from "../types";
import { BaseResumeStep } from "./BaseResumeStep";
import { BasicAuthStep } from "./BasicAuthStep";
import { LlmConnectionStep } from "./LlmConnectionStep";
import { SearchTermsStep } from "./SearchTermsStep";

export const OnboardingStepContent: React.FC<{
  baseResumeValidation: ValidationState;
  baseResumeValue: string | null;
  basicAuthChoice: BasicAuthChoice;
  basicAuthPassword: string;
  basicAuthUser: string;
  currentStep: StepId;
  defaultModel: string | null | undefined;
  effectiveModel: string | null | undefined;
  isBusy: boolean;
  isImportingResume: boolean;
  isGeneratingSearchTerms: boolean;
  isResumeReady: boolean;
  isRxResumeSelfHosted: boolean;
  hasSavedSearchTermsInSession: boolean;
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
  searchTermDraft: string;
  searchTerms: string[];
  searchTermsSource: SearchTermsSuggestionResponse["source"] | null;
  searchTermsStale: boolean;
  savedBaseUrl: string | null | undefined;
  savedProvider: string | null | undefined;
  selectedProvider: LlmProviderId;
  onLlmApiKeyChange: (value: string) => void;
  onLlmBaseUrlChange: (value: string) => void;
  onLlmModelChange: (value: string) => void;
  onLlmProviderChange: (value: string) => void;
  onBasicAuthChoiceChange: (choice: BasicAuthChoice) => void;
  onBasicAuthPasswordChange: (value: string) => void;
  onBasicAuthUserChange: (value: string) => void;
  onImportResumeFile: (file: File) => Promise<void>;
  onRegenerateSearchTerms: () => Promise<void>;
  onRxresumeApiKeyChange: (value: string) => void;
  onRxresumeSelfHostedChange: (next: boolean) => void;
  onRxresumeUrlChange: (value: string) => void;
  onResumeSetupModeChange: (mode: ResumeSetupMode) => void;
  onSearchTermDraftChange: (value: string) => void;
  onSearchTermsChange: (values: string[]) => void;
  onTemplateResumeChange: (value: string | null) => void;
}> = (props) => {
  if (props.currentStep === "llm") {
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

  if (props.currentStep === "searchterms") {
    return (
      <SearchTermsStep
        hasSavedSearchTermsInSession={props.hasSavedSearchTermsInSession}
        isBusy={props.isBusy}
        isGeneratingSearchTerms={props.isGeneratingSearchTerms}
        searchTermDraft={props.searchTermDraft}
        searchTerms={props.searchTerms}
        searchTermsSource={props.searchTermsSource}
        searchTermsStale={props.searchTermsStale}
        onRegenerate={props.onRegenerateSearchTerms}
        onSearchTermDraftChange={props.onSearchTermDraftChange}
        onSearchTermsChange={props.onSearchTermsChange}
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
