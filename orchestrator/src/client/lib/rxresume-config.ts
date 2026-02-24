import type { RxResumeMode } from "@shared/types.js";

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

type Drafts = ReturnType<typeof getRxResumeCredentialDrafts>;
type Stored = Pick<
  ReturnType<typeof getStoredRxResumeCredentialAvailability>,
  "email" | "password" | "apiKey"
>;

export const getRxResumeCredentialPrecheckFailure = (input: {
  mode: RxResumeMode;
  stored: Stored;
  draft: Drafts;
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

export const getRxResumeMissingCredentialLabels = (input: {
  mode: RxResumeMode;
  stored: Stored;
  draft: Drafts;
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

export const toRxResumeValidationPayload = (draft: Drafts) => ({
  email: draft.email || undefined,
  password: draft.password || undefined,
  apiKey: draft.apiKey || undefined,
});
