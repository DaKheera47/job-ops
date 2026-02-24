import type { RxResumeMode } from "@shared/types.js";

export const RXRESUME_MODES: readonly RxResumeMode[] = ["v4", "v5"] as const;

type RxResumeSettingsSnapshot =
  | {
      rxresumeMode?: { value?: string | null } | null;
      rxresumeEmail?: string | null;
      rxresumePasswordHint?: string | null;
      rxresumeApiKeyHint?: string | null;
      rxresumeBaseResumeId?: string | null;
      rxresumeBaseResumeIdV4?: string | null;
      rxresumeBaseResumeIdV5?: string | null;
    }
  | null
  | undefined;

export type RxResumeCredentialAvailability = {
  email: boolean;
  password: boolean;
  apiKey: boolean;
  hasV4: boolean;
  hasV5: boolean;
};

export type RxResumeCredentialDrafts = {
  email: string;
  password: string;
  apiKey: string;
};

export type RxResumeCredentialPrecheckFailure =
  | "missing-v4-email-password"
  | "missing-v5-api-key";

export function isRxResumeMode(value: unknown): value is RxResumeMode {
  return value === "v4" || value === "v5";
}

export function coerceRxResumeMode(
  value: unknown,
  fallback: RxResumeMode = "v5",
): RxResumeMode {
  return isRxResumeMode(value) ? value : fallback;
}

export function getStoredRxResumeCredentialAvailability(
  settings: RxResumeSettingsSnapshot,
): RxResumeCredentialAvailability {
  const email = Boolean(settings?.rxresumeEmail?.trim());
  const password = Boolean(settings?.rxresumePasswordHint);
  const apiKey = Boolean(settings?.rxresumeApiKeyHint);

  return {
    email,
    password,
    apiKey,
    hasV4: email && password,
    hasV5: apiKey,
  };
}

export function getInitialRxResumeMode(input: {
  savedMode: RxResumeMode | null | undefined;
  hasV4: boolean;
  hasV5: boolean;
}): RxResumeMode {
  if (isRxResumeMode(input.savedMode)) return input.savedMode;
  if (input.hasV4 && !input.hasV5) return "v4";
  return "v5";
}

export function getRxResumeModeFromSettings(
  settings: RxResumeSettingsSnapshot,
  fallback: RxResumeMode = "v5",
): RxResumeMode {
  return coerceRxResumeMode(settings?.rxresumeMode?.value, fallback);
}

export function getRxResumeBaseResumeIdsByMode(
  settings: RxResumeSettingsSnapshot,
  effectiveMode: RxResumeMode,
): Record<RxResumeMode, string | null> {
  const v4 =
    settings?.rxresumeBaseResumeIdV4 ??
    (effectiveMode === "v4" ? (settings?.rxresumeBaseResumeId ?? null) : null);
  const v5 =
    settings?.rxresumeBaseResumeIdV5 ??
    (effectiveMode === "v5" ? (settings?.rxresumeBaseResumeId ?? null) : null);

  return { v4, v5 };
}

export function getRxResumeBaseResumeIdForMode(
  idsByMode: Record<RxResumeMode, string | null>,
  mode: RxResumeMode,
): string | null {
  return idsByMode[mode] ?? null;
}

export function getRxResumeCredentialDrafts(input: {
  rxresumeEmail?: string | null;
  rxresumePassword?: string | null;
  rxresumeApiKey?: string | null;
}): RxResumeCredentialDrafts {
  return {
    email: input.rxresumeEmail?.trim() ?? "",
    password: input.rxresumePassword?.trim() ?? "",
    apiKey: input.rxresumeApiKey?.trim() ?? "",
  };
}

export function getRxResumeCredentialPrecheckFailure(input: {
  mode: RxResumeMode;
  stored: Pick<RxResumeCredentialAvailability, "email" | "password" | "apiKey">;
  draft: RxResumeCredentialDrafts;
}): RxResumeCredentialPrecheckFailure | null {
  const hasV4Configured =
    (input.stored.email || Boolean(input.draft.email)) &&
    (input.stored.password || Boolean(input.draft.password));
  const hasV5Configured = input.stored.apiKey || Boolean(input.draft.apiKey);

  if (input.mode === "v5" && !hasV5Configured) return "missing-v5-api-key";
  if (input.mode === "v4" && !hasV4Configured)
    return "missing-v4-email-password";
  return null;
}

export function toRxResumeValidationPayload(draft: RxResumeCredentialDrafts): {
  email?: string;
  password?: string;
  apiKey?: string;
} {
  return {
    email: draft.email || undefined,
    password: draft.password || undefined,
    apiKey: draft.apiKey || undefined,
  };
}
