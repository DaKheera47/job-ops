import * as settingsRepo from '@server/repositories/settings.js';
import { SettingKey } from '@server/repositories/settings.js';

const envDefaults: Record<string, string | undefined> = { ...process.env };

const readableStringConfig: { settingKey: SettingKey, envKey: string }[] = [
  { settingKey: 'rxresumeEmail', envKey: 'RXRESUME_EMAIL' },
  { settingKey: 'ukvisajobsEmail', envKey: 'UKVISAJOBS_EMAIL' },
  { settingKey: 'basicAuthUser', envKey: 'BASIC_AUTH_USER' },
];

const readableBooleanConfig: { settingKey: SettingKey, envKey: string, defaultValue: boolean }[] = [];

const privateStringConfig: { settingKey: SettingKey, envKey: string, hintKey: string }[] = [
  { settingKey: 'openrouterApiKey', envKey: 'OPENROUTER_API_KEY', hintKey: 'openrouterApiKeyHint' },
  { settingKey: 'rxresumePassword', envKey: 'RXRESUME_PASSWORD', hintKey: 'rxresumePasswordHint' },
  { settingKey: 'ukvisajobsPassword', envKey: 'UKVISAJOBS_PASSWORD', hintKey: 'ukvisajobsPasswordHint' },
  { settingKey: 'basicAuthPassword', envKey: 'BASIC_AUTH_PASSWORD', hintKey: 'basicAuthPasswordHint' },
  { settingKey: 'webhookSecret', envKey: 'WEBHOOK_SECRET', hintKey: 'webhookSecretHint' },
];

export function normalizeEnvInput(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseEnvBoolean(raw: string | null | undefined, defaultValue: boolean): boolean {
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  if (raw === 'false' || raw === '0') return false;
  return true;
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

export function serializeEnvBoolean(value: boolean | null): string | null {
  if (value === null) return null;
  return value ? 'true' : 'false';
}

export async function applyStoredEnvOverrides(): Promise<void> {
  await Promise.all([
    ...readableStringConfig.map(async ({ settingKey, envKey }) => {
      const override = await settingsRepo.getSetting(settingKey);
      if (override === null) return;
      applyEnvValue(envKey, normalizeEnvInput(override));
    }),
    ...readableBooleanConfig.map(async ({ settingKey, envKey, defaultValue }) => {
      const override = await settingsRepo.getSetting(settingKey);
      if (override === null) return;
      const parsed = parseEnvBoolean(override, defaultValue);
      applyEnvValue(envKey, serializeEnvBoolean(parsed));
    }),
    ...privateStringConfig.map(async ({ settingKey, envKey }) => {
      const override = await settingsRepo.getSetting(settingKey);
      if (override === null) return;
      applyEnvValue(envKey, normalizeEnvInput(override));
    }),
  ]);
}

export async function getEnvSettingsData(
  overrides?: Partial<Record<SettingKey, string>>
): Promise<Record<string, string | boolean | number | null>> {
  const activeOverrides = overrides || await settingsRepo.getAllSettings();
  const readableValues: Record<string, string | boolean | null> = {};
  const privateValues: Record<string, string | null> = {};

  for (const { settingKey, envKey } of readableStringConfig) {
    const override = activeOverrides[settingKey] ?? null;
    const rawValue = override ?? process.env[envKey];
    readableValues[settingKey] = normalizeEnvInput(rawValue);
  }

  for (const { settingKey, envKey, defaultValue } of readableBooleanConfig) {
    const override = activeOverrides[settingKey] ?? null;
    const rawValue = override ?? process.env[envKey];
    readableValues[settingKey] = parseEnvBoolean(rawValue, defaultValue);
  }

  for (const { settingKey, envKey, hintKey } of privateStringConfig) {
    const override = activeOverrides[settingKey] ?? null;
    const rawValue = override ?? process.env[envKey];
    privateValues[hintKey] = rawValue ? rawValue.slice(0, 4) : null;
  }

  const basicAuthUser = activeOverrides['basicAuthUser'] ?? process.env.BASIC_AUTH_USER;
  const basicAuthPassword = activeOverrides['basicAuthPassword'] ?? process.env.BASIC_AUTH_PASSWORD;

  return {
    ...readableValues,
    ...privateValues,
    basicAuthActive: Boolean(basicAuthUser && basicAuthPassword),
  };
}

export const envSettingConfig = {
  readableStringConfig,
  readableBooleanConfig,
  privateStringConfig,
};
