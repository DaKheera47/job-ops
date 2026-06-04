const ANALYTICS_DISABLED_TRUTHY_VALUES = new Set(["1", "true", "yes", "on"]);

export function isEnvFlagEnabled(value: string | null | undefined): boolean {
  const normalized = value?.trim().toLowerCase();
  return normalized ? ANALYTICS_DISABLED_TRUTHY_VALUES.has(normalized) : false;
}

export function isProductAnalyticsDisabled(): boolean {
  return isEnvFlagEnabled(process.env.JOBOPS_DISABLE_ANALYTICS);
}
