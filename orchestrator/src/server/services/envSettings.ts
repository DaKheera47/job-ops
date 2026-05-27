import type { SettingKey } from "@server/repositories/settings";
import * as settingsRepo from "@server/repositories/settings";
import { resolveLlmApiKey } from "@server/services/llm/credentials";
import { settingsRegistry } from "@shared/settings-registry";
import type { AppSettings } from "@shared/types";

const envDefaults: Record<string, string | undefined> = { ...process.env };

export function getOriginalEnvValue(envKey: string): string | undefined {
  const live = process.env[envKey];
  if (live !== undefined) return live;
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
      const effectiveSecret =
        key === "llmApiKey"
          ? resolveLlmApiKey({
              storedApiKey: override,
              provider:
                normalizeEnvInput(
                  activeOverrides.llmProvider ??
                    getOriginalEnvValue("LLM_PROVIDER"),
                ) ?? null,
            })
          : normalizeEnvInput(rawValue);
      if (!effectiveSecret) {
        // biome-ignore lint/suspicious/noExplicitAny: explicit partial assignment
        (values as any)[hintKey] = null;
        continue;
      }
      const hintLength =
        effectiveSecret.length > 4
          ? 4
          : Math.max(effectiveSecret.length - 1, 1);
      // biome-ignore lint/suspicious/noExplicitAny: explicit partial assignment
      (values as any)[hintKey] = effectiveSecret.slice(0, hintLength);
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: explicit partial assignment
      (values as any)[key] = normalizeEnvInput(rawValue);
    }
  }

  return values;
}
