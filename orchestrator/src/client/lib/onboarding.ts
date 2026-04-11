export type BasicAuthDecision = "enabled" | "skipped";

export const BASIC_AUTH_DECISION_KEY = "jobops.onboarding.basicAuthDecision";

export function readBasicAuthDecision(): BasicAuthDecision | null {
  try {
    const value = localStorage.getItem(BASIC_AUTH_DECISION_KEY);
    return value === "enabled" || value === "skipped" ? value : null;
  } catch {
    return null;
  }
}

export function writeBasicAuthDecision(value: BasicAuthDecision | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(BASIC_AUTH_DECISION_KEY);
      return;
    }
    localStorage.setItem(BASIC_AUTH_DECISION_KEY, value);
  } catch {
    // Ignore storage errors in restricted browser contexts.
  }
}
