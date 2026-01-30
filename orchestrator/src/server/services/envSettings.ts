import type { SettingKey } from "@server/repositories/settings.js";
import * as settingsRepo from "@server/repositories/settings.js";

const envDefaults: Record<string, string | undefined> = { ...process.env };

const readableStringConfig: { settingKey: SettingKey; envKey: string }[] = [
  { settingKey: "llmProvider", envKey: "LLM_PROVIDER" },
  { settingKey: "llmBaseUrl", envKey: "LLM_BASE_URL" },
  { settingKey: "rxresumeEmail", envKey: "RXRESUME_EMAIL" },
  { settingKey: "ukvisajobsEmail", envKey: "UKVISAJOBS_EMAIL" },
  { settingKey: "basicAuthUser", envKey: "BASIC_AUTH_USER" },
];

const readableBooleanConfig: {
  settingKey: SettingKey;
  envKey: string;
  defaultValue: boolean;
}[] = [];

const privateStringConfig: {
  settingKey: SettingKey;
  envKey: string;
  hintKey: string;
}[] = [
  {
    settingKey: "llmApiKey",
    envKey: "LLM_API_KEY",
    hintKey: "llmApiKeyHint",
  },
  {
    settingKey: "openrouterApiKey",
    envKey: "OPENROUTER_API_KEY",
    hintKey: "openrouterApiKeyHint",
  },
  {
    settingKey: "rxresumePassword",
    envKey: "RXRESUME_PASSWORD",
    hintKey: "rxresumePasswordHint",
  },
  {
    settingKey: "ukvisajobsPassword",
    envKey: "UKVISAJOBS_PASSWORD",
    hintKey: "ukvisajobsPasswordHint",
  },
  {
    settingKey: "basicAuthPassword",
    envKey: "BASIC_AUTH_PASSWORD",
    hintKey: "basicAuthPasswordHint",
  },
  {
    settingKey: "webhookSecret",
    envKey: "WEBHOOK_SECRET",
    hintKey: "webhookSecretHint",
  },
];

export function normalizeEnvInput(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseEnvBoolean(
  raw: string | null | undefined,
  defaultValue: boolean,
): boolean {
  if (raw === undefined || raw === null || raw === "") return defaultValue;
  if (raw === "false" || raw === "0") return false;
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
  return value ? "true" : "false";
}

export async function applyStoredEnvOverrides(): Promise<void> {
  const safeGetSetting = async (key: SettingKey): Promise<string | null> => {
    try {
      return await settingsRepo.getSetting(key);
    } catch (error) {
      // In some test harnesses or first-boot scenarios, the DB may exist but not yet
      // have the settings table. Treat this as "no overrides".
      const msg = String((error as any)?.message ?? error);
      if (msg.includes("no such table") && msg.includes("settings"))
        return null;
      throw error;
    }
  };

  const safeSetSetting = async (key: SettingKey, value: string | null) => {
    try {
      await settingsRepo.setSetting(key, value);
    } catch (error) {
      const msg = String((error as any)?.message ?? error);
      if (msg.includes("no such table") && msg.includes("settings")) return;
      throw error;
    }
  };

  // Migration: move legacy OpenRouter key to the unified LLM key.
  //
  // Users only see their API keys once. If we simply switch to LLM_API_KEY without
  // copying, they may be unable to recover their existing key.
  const providerOverride = await safeGetSetting("llmProvider");
  const legacyOpenrouterKey = normalizeEnvInput(
    await safeGetSetting("openrouterApiKey"),
  );
  const unifiedKey = normalizeEnvInput(await safeGetSetting("llmApiKey"));

  const effectiveProvider = (providerOverride ?? process.env.LLM_PROVIDER)
    ?.trim()
    .toLowerCase();

  if (
    (effectiveProvider ?? "openrouter") === "openrouter" &&
    legacyOpenrouterKey &&
    !unifiedKey
  ) {
    console.warn(
      "[DEPRECATED] Detected stored OpenRouter API key. Migrating to LLM_API_KEY and clearing legacy storage.",
    );
    await safeSetSetting("llmApiKey", legacyOpenrouterKey);
    await safeSetSetting("openrouterApiKey", null);
  }

  // Migration helper for env-based users: copy OPENROUTER_API_KEY -> LLM_API_KEY
  // at runtime so the app keeps working after removing fallback logic.
  if (
    (effectiveProvider ?? "openrouter") === "openrouter" &&
    !normalizeEnvInput(process.env.LLM_API_KEY) &&
    normalizeEnvInput(process.env.OPENROUTER_API_KEY)
  ) {
    console.warn(
      "[DEPRECATED] OPENROUTER_API_KEY is deprecated. Copying to LLM_API_KEY for compatibility.",
    );
    process.env.LLM_API_KEY = normalizeEnvInput(
      process.env.OPENROUTER_API_KEY,
    )!;
  }

  await Promise.all([
    ...readableStringConfig.map(async ({ settingKey, envKey }) => {
      const override = await safeGetSetting(settingKey);
      if (override === null) return;
      applyEnvValue(envKey, normalizeEnvInput(override));
    }),
    ...readableBooleanConfig.map(
      async ({ settingKey, envKey, defaultValue }) => {
        const override = await safeGetSetting(settingKey);
        if (override === null) return;
        const parsed = parseEnvBoolean(override, defaultValue);
        applyEnvValue(envKey, serializeEnvBoolean(parsed));
      },
    ),
    ...privateStringConfig.map(async ({ settingKey, envKey }) => {
      const override = await safeGetSetting(settingKey);
      if (override === null) return;
      applyEnvValue(envKey, normalizeEnvInput(override));
    }),
  ]);
}

export async function getEnvSettingsData(
  overrides?: Partial<Record<SettingKey, string>>,
): Promise<Record<string, string | boolean | number | null>> {
  const activeOverrides = overrides || (await settingsRepo.getAllSettings());
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
    if (!rawValue) {
      privateValues[hintKey] = null;
      continue;
    }

    const hintLength =
      rawValue.length > 4 ? 4 : Math.max(rawValue.length - 1, 1);
    privateValues[hintKey] = rawValue.slice(0, hintLength);
  }

  // Backwards-compat: old clients still expect openrouterApiKeyHint.
  // Always prefer the unified LLM key hint when present.
  if (privateValues.llmApiKeyHint) {
    privateValues.openrouterApiKeyHint = privateValues.llmApiKeyHint;
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

export const envSettingConfig = {
  readableStringConfig,
  readableBooleanConfig,
  privateStringConfig,
};
