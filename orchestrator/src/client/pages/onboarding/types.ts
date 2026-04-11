import type { PdfRenderer, ValidationResult } from "@shared/types.js";

export type ValidationState = ValidationResult & { checked: boolean };

export type OnboardingFormData = {
  llmProvider: string;
  llmBaseUrl: string;
  llmApiKey: string;
  pdfRenderer: PdfRenderer;
  rxresumeUrl: string;
  rxresumeApiKey: string;
  rxresumeBaseResumeId: string | null;
  basicAuthUser: string;
  basicAuthPassword: string;
};

export type StepId = "llm" | "rxresume" | "baseresume" | "basicauth";
export type BasicAuthChoice = "enable" | "skip" | null;

export type OnboardingStep = {
  id: StepId;
  label: string;
  subtitle: string;
  complete: boolean;
  disabled: boolean;
};
