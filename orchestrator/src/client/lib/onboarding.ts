import type { AppSettings } from "@shared/types";

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
}): boolean {
  if (input.demoMode) return true;
  if (!input.settings) return false;

  const searchTermsValid =
    input.searchTermsValid ?? hasSavedSearchTermsOnboarding(input.settings);

  return Boolean(
    input.llmValid &&
      input.baseResumeValid &&
      searchTermsValid &&
      hasCompletedBasicAuthOnboarding(input.settings),
  );
}
