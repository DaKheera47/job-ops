import type { SettingKey } from "@server/repositories/settings";
import * as settingsRepo from "@server/repositories/settings";
import { applyEnvValue, normalizeEnvInput } from "@server/services/envSettings";
import { getProfile } from "@server/services/profile";
import {
  extractProjectsFromProfile,
  normalizeResumeProjectsSettings,
} from "@server/services/resumeProjects";
import {
  type SettingsConversionKey,
  serializeSettingValue,
} from "@server/services/settings-conversion";
import type { UpdateSettingsInput } from "@shared/settings-schema";

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
  return serializeSettingValue("ukvisajobsMaxJobs", value);
}

export function toJsonOrNull<T>(value: T | null | undefined): string | null {
  return value !== null && value !== undefined ? JSON.stringify(value) : null;
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

function metadataPersistAction(
  key: SettingsConversionKey,
  value: unknown,
): SettingsUpdateAction {
  return persistAction(key, serializeSettingValue(key, value as never));
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
      actions: [metadataPersistAction("ukvisajobsMaxJobs", value)],
    }),
  ),
  adzunaMaxJobsPerTerm: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("adzunaMaxJobsPerTerm", value)],
    }),
  ),
  gradcrackerMaxJobsPerTerm: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("gradcrackerMaxJobsPerTerm", value)],
    }),
  ),
  searchTerms: singleAction(({ value }) =>
    result({ actions: [metadataPersistAction("searchTerms", value)] }),
  ),
  searchCities: singleAction(({ value }) =>
    result({ actions: [metadataPersistAction("searchCities", value)] }),
  ),
  // Deprecated legacy key; persist into canonical searchCities setting.
  jobspyLocation: singleAction(({ value }) =>
    result({ actions: [metadataPersistAction("searchCities", value)] }),
  ),
  jobspyResultsWanted: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("jobspyResultsWanted", value)],
    }),
  ),
  jobspyCountryIndeed: singleAction(({ value }) =>
    result({ actions: [metadataPersistAction("jobspyCountryIndeed", value)] }),
  ),
  showSponsorInfo: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("showSponsorInfo", value)],
    }),
  ),
  chatStyleTone: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("chatStyleTone", value)],
    }),
  ),
  chatStyleFormality: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("chatStyleFormality", value)],
    }),
  ),
  chatStyleConstraints: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("chatStyleConstraints", value)],
    }),
  ),
  chatStyleDoNotUse: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("chatStyleDoNotUse", value)],
    }),
  ),
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
  adzunaAppId: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("adzunaAppId", normalized, () => {
          applyEnvValue("ADZUNA_APP_ID", normalized);
        }),
      ],
    });
  }),
  adzunaAppKey: singleAction(({ value }) => {
    const normalized = toNormalizedStringOrNull(value);
    return result({
      actions: [
        persistAction("adzunaAppKey", normalized, () => {
          applyEnvValue("ADZUNA_APP_KEY", normalized);
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
      actions: [metadataPersistAction("backupEnabled", value)],
      deferred: ["refreshBackupScheduler"],
    }),
  ),
  backupHour: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("backupHour", value)],
      deferred: ["refreshBackupScheduler"],
    }),
  ),
  backupMaxCount: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("backupMaxCount", value)],
      deferred: ["refreshBackupScheduler"],
    }),
  ),
  penalizeMissingSalary: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("penalizeMissingSalary", value)],
    }),
  ),
  missingSalaryPenalty: singleAction(({ value }) =>
    result({
      actions: [metadataPersistAction("missingSalaryPenalty", value)],
    }),
  ),
};
