import type { SettingKey } from "@server/repositories/settings";
import * as settingsRepo from "@server/repositories/settings";
import { applyEnvValue, normalizeEnvInput } from "@server/services/envSettings";
import { getProfile } from "@server/services/profile";
import {
  extractProjectsFromProfile,
  normalizeResumeProjectsSettings,
} from "@server/services/resumeProjects";
import {
  getRxResumeBaseResumeIdKey,
  normalizeRxResumeMode,
} from "@server/services/rxresume/baseResumeId";
import { settingsRegistry } from "@shared/settings-registry";
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
  settingKey: SettingKey,
  value: string | null,
  sideEffect?: () => void | Promise<void>,
): SettingsUpdateAction {
  return {
    settingKey,
    persist: () => settingsRepo.setSetting(settingKey, value),
    sideEffect,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const settingsUpdateRegistry: Partial<{
  [K in keyof UpdateSettingsInput]: SettingUpdateHandler<K>;
}> = {};

for (const [key, def] of Object.entries(settingsRegistry)) {
  if (def.kind === "virtual") continue;

  const targetKey =
    def.kind === "alias" ? (def.target as SettingKey) : (key as SettingKey);
  const isBackup = key.startsWith("backup");
  const hasEnvKey = "envKey" in def && !!def.envKey;

  // Special case for resumeProjects
  if (key === "resumeProjects") {
    settingsUpdateRegistry.resumeProjects = async ({ value }) => {
      const resumeProjects = value ?? null;
      if (resumeProjects === null) {
        return result({ actions: [persistAction(targetKey, null)] });
      }

      const profile = await getProfile();
      const { catalog } = extractProjectsFromProfile(profile);
      const allowed = new Set(catalog.map((project) => project.id));
      const normalized = normalizeResumeProjectsSettings(
        resumeProjects as Parameters<typeof normalizeResumeProjectsSettings>[0],
        allowed,
      );

      return result({
        actions: [persistAction(targetKey, JSON.stringify(normalized))],
      });
    };
    continue;
  }

  if (key === "rxresumeBaseResumeId") {
    settingsUpdateRegistry.rxresumeBaseResumeId = async ({
      value,
      context,
    }) => {
      const serialized = normalizeEnvInput(value as string | null | undefined);
      const mode = normalizeRxResumeMode(
        context.input.rxresumeMode ??
          (await settingsRepo.getSetting("rxresumeMode")) ??
          process.env.RXRESUME_MODE ??
          null,
      );
      const modeSpecificKey = getRxResumeBaseResumeIdKey(mode);

      return result({
        actions: [
          // Keep the legacy/current key in sync for compatibility and fallback.
          persistAction("rxresumeBaseResumeId", serialized),
          persistAction(modeSpecificKey, serialized),
        ],
      });
    };
    continue;
  }

  // Generic handler for all others
  settingsUpdateRegistry[key as keyof UpdateSettingsInput] = ({ value }) => {
    let serialized: string | null;

    if ("serialize" in def) {
      serialized = def.serialize(value as never);
    } else {
      serialized = normalizeEnvInput(value as string);
    }

    const sideEffect = hasEnvKey
      ? () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          // biome-ignore lint/suspicious/noExplicitAny: def is constrained by kind
          applyEnvValue((def as any).envKey, serialized);
        }
      : undefined;

    return result({
      actions: [persistAction(targetKey, serialized, sideEffect)],
      deferred: isBackup ? ["refreshBackupScheduler"] : [],
    });
  };
}
