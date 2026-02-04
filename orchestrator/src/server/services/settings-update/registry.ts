import type { SettingKey } from "@server/repositories/settings";
import * as settingsRepo from "@server/repositories/settings";
import { applyEnvValue, normalizeEnvInput } from "@server/services/envSettings";
import { getProfile } from "@server/services/profile";
import {
  extractProjectsFromProfile,
  normalizeResumeProjectsSettings,
} from "@server/services/resumeProjects";
import type { UpdateSettingsInput } from "@shared/settings-schema";
import { toStringOrNull as toStringOrNullShared } from "@shared/utils/type-conversion";

export type DeferredSideEffect = "refreshBackupScheduler";

export type SettingsUpdateAction = {
  settingKey: SettingKey;
  persist: () => Promise<void>;
  sideEffect?: () => void | Promise<void>;
};

export type SettingsUpdateResult = {
  actions: SettingsUpdateAction[];
  deferredSideEffects: Set<DeferredSideEffect>;
};

export type SettingsUpdateContext = {
  input: UpdateSettingsInput;
};

export type SettingUpdateHandler<K extends keyof UpdateSettingsInput> = (args: {
  key: K;
  value: UpdateSettingsInput[K];
  context: SettingsUpdateContext;
}) => Promise<SettingsUpdateResult> | SettingsUpdateResult;

export type SettingsUpdatePlan = {
  shouldRefreshBackupScheduler: boolean;
};

export function toNormalizedStringOrNull(
  value: string | null | undefined,
): string | null {
  return normalizeEnvInput(value);
}

export function toNumberStringOrNull(
  value: number | null | undefined,
): string | null {
  return toStringOrNullShared(value);
}

export function toJsonOrNull<T>(value: T | null | undefined): string | null {
  return value !== null && value !== undefined ? JSON.stringify(value) : null;
}

export function toBitBoolOrNull(
  value: boolean | null | undefined,
): string | null {
  if (value === null || value === undefined) return null;
  return value ? "1" : "0";
}

function result(
  args: {
    actions?: SettingsUpdateAction[];
    deferred?: DeferredSideEffect[];
  } = {},
): SettingsUpdateResult {
  return {
    actions: args.actions ?? [],
    deferredSideEffects: new Set(args.deferred ?? []),
  };
}

function persistAction(
  settingKey: Parameters<typeof settingsRepo.setSetting>[0],
  value: string | null,
  sideEffect?: () => void | Promise<void>,
): SettingsUpdateAction {
  return {
    settingKey,
    persist: () => settingsRepo.setSetting(settingKey, value),
    sideEffect,
  };
}

function singleAction<K extends keyof UpdateSettingsInput>(
  fn: SettingUpdateHandler<K>,
): SettingUpdateHandler<K> {
  return fn;
}

export const settingsUpdateRegistry: Partial<{
  [K in keyof UpdateSettingsInput]: SettingUpdateHandler<K>;
}> = {
  model: singleAction(({ value }) =>
    result({ actions: [persistAction("model", value ?? null)] }),
  ),
  modelScorer: singleAction(({ value }) =>
    result({ actions: [persistAction("modelScorer", value ?? null)] }),
  ),
  modelTailoring: singleAction(({ value }) =>
    result({ actions: [persistAction("modelTailoring", value ?? null)] }),
  ),
  modelProjectSelection: singleAction(({ value }) =>
    result({
      actions: [persistAction("modelProjectSelection", value ?? null)],
    }),
  ),
  llmProvider: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("llmProvider", normalized, () => {
          applyEnvValue("LLM_PROVIDER", normalized);
        }),
      ],
    });
  }),
  llmBaseUrl: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("llmBaseUrl", normalized, () => {
          applyEnvValue("LLM_BASE_URL", normalized);
        }),
      ],
    });
  }),
  pipelineWebhookUrl: singleAction(({ value }) =>
    result({ actions: [persistAction("pipelineWebhookUrl", value ?? null)] }),
  ),
  jobCompleteWebhookUrl: singleAction(({ value }) =>
    result({
      actions: [persistAction("jobCompleteWebhookUrl", value ?? null)],
    }),
  ),
  rxresumeBaseResumeId: singleAction(({ value }) =>
    result({
      actions: [
        persistAction("rxresumeBaseResumeId", toNormalizedStringOrNull(value)),
      ],
    }),
  ),
  resumeProjects: singleAction(async ({ value }) => {
    const resumeProjects = value ?? null;
    if (resumeProjects === null) {
      return result({ actions: [persistAction("resumeProjects", null)] });
    }

    const profile = await getProfile();
    const { catalog } = extractProjectsFromProfile(profile);
    const allowed = new Set(catalog.map((project) => project.id));
    const normalized = normalizeResumeProjectsSettings(resumeProjects, allowed);

    return result({
      actions: [persistAction("resumeProjects", JSON.stringify(normalized))],
    });
  }),
  ukvisajobsMaxJobs: singleAction(({ value }) =>
    result({
      actions: [
        persistAction("ukvisajobsMaxJobs", toNumberStringOrNull(value)),
      ],
    }),
  ),
  gradcrackerMaxJobsPerTerm: singleAction(({ value }) =>
    result({
      actions: [
        persistAction("gradcrackerMaxJobsPerTerm", toNumberStringOrNull(value)),
      ],
    }),
  ),
  searchTerms: singleAction(({ value }) =>
    result({ actions: [persistAction("searchTerms", toJsonOrNull(value))] }),
  ),
  jobspyLocation: singleAction(({ value }) =>
    result({ actions: [persistAction("jobspyLocation", value ?? null)] }),
  ),
  jobspyResultsWanted: singleAction(({ value }) =>
    result({
      actions: [
        persistAction("jobspyResultsWanted", toNumberStringOrNull(value)),
      ],
    }),
  ),
  jobspyHoursOld: singleAction(({ value }) =>
    result({
      actions: [persistAction("jobspyHoursOld", toNumberStringOrNull(value))],
    }),
  ),
  jobspyCountryIndeed: singleAction(({ value }) =>
    result({ actions: [persistAction("jobspyCountryIndeed", value ?? null)] }),
  ),
  jobspySites: singleAction(({ value }) =>
    result({ actions: [persistAction("jobspySites", toJsonOrNull(value))] }),
  ),
  jobspyLinkedinFetchDescription: singleAction(({ value }) =>
    result({
      actions: [
        persistAction("jobspyLinkedinFetchDescription", toBitBoolOrNull(value)),
      ],
    }),
  ),
  jobspyIsRemote: singleAction(({ value }) =>
    result({
      actions: [persistAction("jobspyIsRemote", toBitBoolOrNull(value))],
    }),
  ),
  showSponsorInfo: singleAction(({ value }) =>
    result({
      actions: [persistAction("showSponsorInfo", toBitBoolOrNull(value))],
    }),
  ),
  openrouterApiKey: singleAction(({ value }) => {
    console.warn(
      "[DEPRECATED] Received openrouterApiKey update. Storing as llmApiKey and clearing legacy openrouterApiKey.",
    );
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("llmApiKey", normalized, () => {
          applyEnvValue("LLM_API_KEY", normalized);
        }),
        persistAction("openrouterApiKey", null, () => {
          applyEnvValue("OPENROUTER_API_KEY", null);
        }),
      ],
    });
  }),
  llmApiKey: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("llmApiKey", normalized, () => {
          applyEnvValue("LLM_API_KEY", normalized);
        }),
      ],
    });
  }),
  rxresumeEmail: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("rxresumeEmail", normalized, () => {
          applyEnvValue("RXRESUME_EMAIL", normalized);
        }),
      ],
    });
  }),
  rxresumePassword: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("rxresumePassword", normalized, () => {
          applyEnvValue("RXRESUME_PASSWORD", normalized);
        }),
      ],
    });
  }),
  basicAuthUser: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("basicAuthUser", normalized, () => {
          applyEnvValue("BASIC_AUTH_USER", normalized);
        }),
      ],
    });
  }),
  basicAuthPassword: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("basicAuthPassword", normalized, () => {
          applyEnvValue("BASIC_AUTH_PASSWORD", normalized);
        }),
      ],
    });
  }),
  ukvisajobsEmail: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("ukvisajobsEmail", normalized, () => {
          applyEnvValue("UKVISAJOBS_EMAIL", normalized);
        }),
      ],
    });
  }),
  ukvisajobsPassword: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("ukvisajobsPassword", normalized, () => {
          applyEnvValue("UKVISAJOBS_PASSWORD", normalized);
        }),
      ],
    });
  }),
  webhookSecret: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("webhookSecret", normalized, () => {
          applyEnvValue("WEBHOOK_SECRET", normalized);
        }),
      ],
    });
  }),
  backupEnabled: singleAction(({ value }) =>
    result({
      actions: [persistAction("backupEnabled", toBitBoolOrNull(value))],
      deferred: ["refreshBackupScheduler"],
    }),
  ),
  backupHour: singleAction(({ value }) =>
    result({
      actions: [persistAction("backupHour", toNumberStringOrNull(value))],
      deferred: ["refreshBackupScheduler"],
    }),
  ),
  backupMaxCount: singleAction(({ value }) =>
    result({
      actions: [persistAction("backupMaxCount", toNumberStringOrNull(value))],
      deferred: ["refreshBackupScheduler"],
    }),
  ),
};
