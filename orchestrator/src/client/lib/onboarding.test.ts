import { describe, expect, it } from "vitest";
import {
  hasCompletedBasicAuthOnboarding,
  isOnboardingComplete,
} from "./onboarding";

describe("onboarding helpers", () => {
  it("treats a skipped basic-auth decision as complete", () => {
    expect(
      hasCompletedBasicAuthOnboarding({
        basicAuthActive: false,
        onboardingBasicAuthDecision: "skipped",
      } as any),
    ).toBe(true);
  });

  it("requires all onboarding validations when not in demo mode", () => {
    expect(
      isOnboardingComplete({
        demoMode: false,
        settings: {
          basicAuthActive: false,
          onboardingBasicAuthDecision: "skipped",
        } as any,
        llmValid: true,
        baseResumeValid: false,
      }),
    ).toBe(false);

    expect(
      isOnboardingComplete({
        demoMode: false,
        settings: {
          basicAuthActive: false,
          onboardingBasicAuthDecision: "skipped",
        } as any,
        llmValid: true,
        baseResumeValid: true,
      }),
    ).toBe(true);
  });
});
