import type { AppSettings } from "@shared/types";

export function hasCompletedBasicAuthOnboarding(
  settings: AppSettings | null | undefined,
): boolean {
  return Boolean(
    settings?.basicAuthActive || settings?.onboardingBasicAuthDecision !== null,
  );
}

export function isOnboardingComplete(input: {
  demoMode: boolean;
  settings: AppSettings | null | undefined;
  llmValid: boolean;
  baseResumeValid: boolean;
}): boolean {
  if (input.demoMode) return true;
  if (!input.settings) return false;

  return Boolean(
    input.llmValid &&
      input.baseResumeValid &&
      hasCompletedBasicAuthOnboarding(input.settings),
  );
}
