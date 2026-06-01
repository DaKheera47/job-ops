import type {
  OnboardingRequirementId,
  PdfRenderer,
  ValidationResult,
} from "@shared/types.js";

export type ValidationState = ValidationResult & {
  checked: boolean;
  hydrated: boolean;
};

export type OnboardingFormData = {
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  model: string;
  pdfRenderer: PdfRenderer;
  rxresumeUrl: string;
  rxresumeApiKey: string;
  rxresumeBaseResumeId: string | null;
};

export type StepId = OnboardingRequirementId;
export type OnboardingPanelId = StepId | "first-run";
export type ResumeSetupMode = "upload" | "rxresume";

export type OnboardingStep = {
  id: StepId;
  label: string;
  subtitle: string;
  complete: boolean;
  disabled: boolean;
};
