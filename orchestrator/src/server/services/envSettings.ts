import type { SettingKey } from "@server/repositories/settings";
import * as settingsRepo from "@server/repositories/settings";
import { settingsRegistry } from "@shared/settings-registry";

const envDefaults: Record<string, string | undefined> = { ...process.env };

export function normalizeEnvInput(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function applyEnvValue(envKey: string, value: string | null): void {
  if (value === null) {
    const fallback = envDefaults[envKey];
    if (fallback === undefined) {
      delete process.env[envKey];
    } else {
      process.env[envKey] = fallback;
    }
    return;
  }

  process.env[envKey] = value;
}

export async function applyStoredEnvOverrides(): Promise<void> {
  const safeGetSetting = async (key: SettingKey): Promise<string | null> => {
    try {
      return await settingsRepo.getSetting(key);
    } catch (error) {
      const msg = String((error as Error)?.message ?? error);
      if (msg.includes("no such table") && msg.includes("settings")) {
        return null;
      }
      throw error;
    }
  };

  const tasks = Object.entries(settingsRegistry).map(async ([key, def]) => {
    if (!("envKey" in def) || !def.envKey) return;
    const override = await safeGetSetting(key as SettingKey);
    if (override === null) return;
    applyEnvValue(def.envKey, normalizeEnvInput(override));
  });

  await Promise.all(tasks);
}

export async function getEnvSettingsData(
  overrides?: Partial<Record<SettingKey, string>>,
): Promise<Record<string, string | boolean | number | null>> {
  const activeOverrides = overrides || (await settingsRepo.getAllSettings());
  const readableValues: Record<string, string | boolean | null> = {};
  const privateValues: Record<string, string | null> = {};

  for (const [key, def] of Object.entries(settingsRegistry)) {
    if (!("envKey" in def) || !def.envKey) continue;

    const override = activeOverrides[key as SettingKey] ?? null;
    const rawValue = override ?? process.env[def.envKey];

    if (def.kind === "secret") {
      const hintKey = `${key}Hint`;
      if (!rawValue) {
        privateValues[hintKey] = null;
        continue;
      }
      const hintLength =
        rawValue.length > 4 ? 4 : Math.max(rawValue.length - 1, 1);
      privateValues[hintKey] = rawValue.slice(0, hintLength);
    } else {
      readableValues[key] = normalizeEnvInput(rawValue);
    }
  }

  const basicAuthUser =
    activeOverrides.basicAuthUser ?? process.env.BASIC_AUTH_USER;
  const basicAuthPassword =
    activeOverrides.basicAuthPassword ?? process.env.BASIC_AUTH_PASSWORD;

  return {
    ...readableValues,
    ...privateValues,
    basicAuthActive: Boolean(basicAuthUser && basicAuthPassword),
  };
}
