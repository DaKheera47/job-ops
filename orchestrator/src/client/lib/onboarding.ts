import type { AppSettings } from "@shared/types";

type OnboardingStepId = "llm" | "baseresume" | "searchterms" | "basicauth";

export function hasCompletedBasicAuthOnboarding(
  settings: AppSettings | null | undefined,
): boolean {
  return Boolean(
    settings?.basicAuthActive || settings?.onboardingBasicAuthDecision !== null,
  );
}

export function hasSavedSearchTermsOnboarding(
  settings: AppSettings | null | undefined,
): boolean {
  return Boolean(
    Array.isArray(settings?.searchTerms?.override) &&
      settings.searchTerms.override.length > 0,
  );
}

export function isOnboardingComplete(input: {
  demoMode: boolean;
  settings: AppSettings | null | undefined;
  llmValid: boolean;
  baseResumeValid: boolean;
  searchTermsValid?: boolean;
  completedStepId?: OnboardingStepId | null;
}): boolean {
  if (input.demoMode) return true;
  if (!input.settings) return false;

  const llmValid = input.completedStepId === "llm" ? true : input.llmValid;
  const baseResumeValid =
    input.completedStepId === "baseresume" ? true : input.baseResumeValid;
  const searchTermsValid =
    input.completedStepId === "searchterms"
      ? true
      : (input.searchTermsValid ??
        hasSavedSearchTermsOnboarding(input.settings));

  return Boolean(
    llmValid &&
      baseResumeValid &&
      searchTermsValid &&
      hasCompletedBasicAuthOnboarding(input.settings),
  );
}
