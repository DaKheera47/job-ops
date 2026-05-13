import type { PdfRenderer, ValidationResult } from "@shared/types.js";

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
  searchTerms: string[];
  searchTermDraft: string;
};

export type StepId = "llm" | "baseresume" | "searchterms";
export type ResumeSetupMode = "upload" | "rxresume";

export type OnboardingStep = {
  id: StepId;
  label: string;
  subtitle: string;
  complete: boolean;
  disabled: boolean;
};
