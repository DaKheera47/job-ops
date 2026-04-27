import type { SettingKey } from "@server/repositories/settings";
import * as settingsRepo from "@server/repositories/settings";
import { settingsRegistry } from "@shared/settings-registry";
import type { AppSettings } from "@shared/types";

const envDefaults: Record<string, string | undefined> = { ...process.env };

export function getOriginalEnvValue(envKey: string): string | undefined {
  return envDefaults[envKey];
}

export function normalizeEnvInput(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function applyStoredEnvOverrides(): Promise<void> {
  // Settings are tenant-scoped. Applying stored overrides to process.env would
  // leak one tenant's credentials into every other tenant in this Node process.
}

export async function getEnvSettingsData(
  overrides?: Partial<Record<SettingKey, string>>,
): Promise<Partial<AppSettings>> {
  const activeOverrides = overrides || (await settingsRepo.getAllSettings());
  const values: Partial<AppSettings> = {};

  for (const [key, def] of Object.entries(settingsRegistry)) {
    if (def.kind === "typed") continue;
    if (!("envKey" in def) || !def.envKey) continue;

    const override = activeOverrides[key as SettingKey] ?? null;
    const rawValue = override ?? getOriginalEnvValue(def.envKey);

    if (def.kind === "secret") {
      const hintKey = `${key}Hint` as keyof AppSettings;
      if (!rawValue) {
        // biome-ignore lint/suspicious/noExplicitAny: explicit partial assignment
        (values as any)[hintKey] = null;
        continue;
      }
      const hintLength =
        rawValue.length > 4 ? 4 : Math.max(rawValue.length - 1, 1);
      // biome-ignore lint/suspicious/noExplicitAny: explicit partial assignment
      (values as any)[hintKey] = rawValue.slice(0, hintLength);
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: explicit partial assignment
      (values as any)[key] = normalizeEnvInput(rawValue);
    }
  }

  const basicAuthUser = normalizeEnvInput(
    activeOverrides.basicAuthUser ?? getOriginalEnvValue("BASIC_AUTH_USER"),
  );
  const basicAuthPassword = normalizeEnvInput(
    activeOverrides.basicAuthPassword ??
      getOriginalEnvValue("BASIC_AUTH_PASSWORD"),
  );
  const basicAuthActive = Boolean(basicAuthUser && basicAuthPassword);

  values.basicAuthActive = basicAuthActive;
  values.basicAuthPassword = basicAuthActive ? basicAuthPassword : null;

  return values;
}
