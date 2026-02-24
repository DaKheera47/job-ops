import type { UpdateSettingsInput } from "@shared/settings-schema.js";
import type { RxResumeMode, ValidationResult } from "@shared/types.js";

export type RxResumeSettingsLike =
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

export const RXRESUME_MODES = ["v4", "v5"] as const;

export const RXRESUME_PRECHECK_MESSAGES = {
  "missing-v4-email-password": "Add v4 email and password, then test again.",
  "missing-v5-api-key": "Add a v5 API key, then test again.",
} as const;

export const coerceRxResumeMode = (
  value: unknown,
  fallback: RxResumeMode = "v5",
): RxResumeMode => (value === "v4" || value === "v5" ? value : fallback);

export const getStoredRxResumeCredentialAvailability = (
  settings: RxResumeSettingsLike,
) => {
  const email = Boolean(settings?.rxresumeEmail?.trim());
  const password = Boolean(settings?.rxresumePasswordHint);
  const apiKey = Boolean(settings?.rxresumeApiKeyHint);
  return { email, password, apiKey, hasV4: email && password, hasV5: apiKey };
};

export const getInitialRxResumeMode = (input: {
  savedMode: RxResumeMode | null | undefined;
  hasV4: boolean;
  hasV5: boolean;
}): RxResumeMode =>
  coerceRxResumeMode(
    input.savedMode ?? (input.hasV4 && !input.hasV5 ? "v4" : "v5"),
  );

export const getRxResumeBaseResumeSelection = (
  settings: RxResumeSettingsLike,
  mode: RxResumeMode,
) => {
  const idsByMode = {
    v4:
      settings?.rxresumeBaseResumeIdV4 ??
      (mode === "v4" ? (settings?.rxresumeBaseResumeId ?? null) : null),
    v5:
      settings?.rxresumeBaseResumeIdV5 ??
      (mode === "v5" ? (settings?.rxresumeBaseResumeId ?? null) : null),
  } satisfies Record<RxResumeMode, string | null>;
  return { idsByMode, selectedId: idsByMode[mode] ?? null };
};

export const getRxResumeCredentialDrafts = (input: {
  rxresumeEmail?: string | null;
  rxresumePassword?: string | null;
  rxresumeApiKey?: string | null;
}) => ({
  email: input.rxresumeEmail?.trim() ?? "",
  password: input.rxresumePassword?.trim() ?? "",
  apiKey: input.rxresumeApiKey?.trim() ?? "",
});

export type RxResumeCredentialDrafts = ReturnType<
  typeof getRxResumeCredentialDrafts
>;
export type RxResumeStoredCredentialAvailability = Pick<
  ReturnType<typeof getStoredRxResumeCredentialAvailability>,
  "email" | "password" | "apiKey"
>;

export const getRxResumeCredentialPrecheckFailure = (input: {
  mode: RxResumeMode;
  stored: RxResumeStoredCredentialAvailability;
  draft: RxResumeCredentialDrafts;
}) => {
  const hasV4 =
    (input.stored.email || Boolean(input.draft.email)) &&
    (input.stored.password || Boolean(input.draft.password));
  const hasV5 = input.stored.apiKey || Boolean(input.draft.apiKey);
  if (input.mode === "v5" && !hasV5) return "missing-v5-api-key" as const;
  if (input.mode === "v4" && !hasV4)
    return "missing-v4-email-password" as const;
  return null;
};

export type RxResumeCredentialPrecheckFailure = ReturnType<
  typeof getRxResumeCredentialPrecheckFailure
>;

export const getRxResumeMissingCredentialLabels = (input: {
  mode: RxResumeMode;
  stored: RxResumeStoredCredentialAvailability;
  draft: RxResumeCredentialDrafts;
}) =>
  input.mode === "v5"
    ? input.stored.apiKey || input.draft.apiKey
      ? []
      : ["RxResume v5 API key"]
    : [
        ...(input.stored.email || input.draft.email ? [] : ["RxResume email"]),
        ...(input.stored.password || input.draft.password
          ? []
          : ["RxResume password"]),
      ];

export const toRxResumeValidationPayload = (
  draft: RxResumeCredentialDrafts,
) => ({
  email: draft.email || undefined,
  password: draft.password || undefined,
  apiKey: draft.apiKey || undefined,
});

export const buildRxResumeSettingsUpdate = (
  mode: RxResumeMode,
  draft: RxResumeCredentialDrafts,
): Partial<UpdateSettingsInput> => {
  const update: Partial<UpdateSettingsInput> = {
    rxresumeMode: mode,
  };
  if (draft.email) update.rxresumeEmail = draft.email;
  if (draft.password) update.rxresumePassword = draft.password;
  if (draft.apiKey) update.rxresumeApiKey = draft.apiKey;
  return update;
};

type ValidateAndMaybePersistRxResumeModeInput<TSettings> = {
  mode: RxResumeMode;
  stored: RxResumeStoredCredentialAvailability;
  draft: RxResumeCredentialDrafts;
  validate: (
    payload: { mode: RxResumeMode } & ReturnType<
      typeof toRxResumeValidationPayload
    >,
  ) => Promise<ValidationResult>;
  persist?: (update: Partial<UpdateSettingsInput>) => Promise<TSettings>;
  persistOnSuccess?: boolean;
  getPrecheckMessage?: (
    failure: Exclude<RxResumeCredentialPrecheckFailure, null>,
  ) => string;
  getValidationErrorMessage?: (error: unknown, mode: RxResumeMode) => string;
  getPersistErrorMessage?: (error: unknown, mode: RxResumeMode) => string;
};

export type ValidateAndMaybePersistRxResumeModeResult<TSettings> = {
  validation: ValidationResult;
  precheckFailure: RxResumeCredentialPrecheckFailure;
  updatedSettings: TSettings | null;
};

export const validateAndMaybePersistRxResumeMode = async <TSettings>(
  input: ValidateAndMaybePersistRxResumeModeInput<TSettings>,
): Promise<ValidateAndMaybePersistRxResumeModeResult<TSettings>> => {
  const {
    mode,
    stored,
    draft,
    validate,
    persist,
    persistOnSuccess = false,
    getPrecheckMessage = (failure) => RXRESUME_PRECHECK_MESSAGES[failure],
    getValidationErrorMessage = (error) =>
      error instanceof Error ? error.message : "RxResume validation failed",
    getPersistErrorMessage = (error) =>
      error instanceof Error
        ? error.message
        : "Failed to save RxResume settings",
  } = input;

  const precheckFailure = getRxResumeCredentialPrecheckFailure({
    mode,
    stored,
    draft,
  });
  if (precheckFailure) {
    return {
      validation: {
        valid: false,
        message: getPrecheckMessage(precheckFailure),
      },
      precheckFailure,
      updatedSettings: null,
    };
  }

  let validation: ValidationResult;
  try {
    validation = await validate({
      mode,
      ...toRxResumeValidationPayload(draft),
    });
  } catch (error) {
    return {
      validation: {
        valid: false,
        message: getValidationErrorMessage(error, mode),
      },
      precheckFailure: null,
      updatedSettings: null,
    };
  }

  if (!validation.valid || !persistOnSuccess || !persist) {
    return {
      validation: {
        valid: validation.valid,
        message: validation.valid ? null : (validation.message ?? null),
      },
      precheckFailure: null,
      updatedSettings: null,
    };
  }

  try {
    const updatedSettings = await persist(
      buildRxResumeSettingsUpdate(mode, draft),
    );
    return {
      validation: {
        valid: true,
        message: null,
      },
      precheckFailure: null,
      updatedSettings,
    };
  } catch (error) {
    return {
      validation: {
        valid: false,
        message: getPersistErrorMessage(error, mode),
      },
      precheckFailure: null,
      updatedSettings: null,
    };
  }
};
