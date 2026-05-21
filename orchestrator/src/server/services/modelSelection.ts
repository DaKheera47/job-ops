import * as settingsRepo from "@server/repositories/settings";
import { getOriginalEnvValue } from "@server/services/envSettings";
import { LlmService } from "@server/services/llm/service";
import { getEffectiveSettings } from "@server/services/settings";
import {
  getDefaultModelForProvider,
  settingsRegistry,
} from "@shared/settings-registry";
import { LLM_PURPOSE_VALUES, type LlmPurpose } from "@shared/types";

export type LlmModelPurpose = "default" | LlmPurpose;

const MODEL_KEY_BY_PURPOSE: Record<
  LlmPurpose,
  "modelScorer" | "modelTailoring" | "modelProjectSelection"
> = {
  scoring: "modelScorer",
  tailoring: "modelTailoring",
  projectSelection: "modelProjectSelection",
};

function readStringSettingValue(
  setting: { value?: unknown } | null | undefined,
): string | null {
  if (typeof setting?.value !== "string") {
    return null;
  }

  const trimmed = setting.value.trim();
  return trimmed || null;
}

function resolveDefaultModelFromSettings(
  settings: Awaited<ReturnType<typeof getEffectiveSettings>>,
): string {
  return (
    readStringSettingValue(settings?.model) ??
    getDefaultModelForProvider(
      readStringSettingValue(settings?.llmProvider) ??
        getOriginalEnvValue("LLM_PROVIDER"),
      getOriginalEnvValue("MODEL"),
    )
  );
}

function resolveModelFromSettings(
  settings: Awaited<ReturnType<typeof getEffectiveSettings>>,
  purpose: LlmModelPurpose,
): string {
  const defaultModel = resolveDefaultModelFromSettings(settings);
  if (!isLlmPurpose(purpose)) return defaultModel;

  const defaultProvider = readStringSettingValue(settings?.llmProvider);
  const purposeOverride = settings?.llmPurposeOverrides?.value?.[purpose];
  const purposeProvider = purposeOverride?.provider?.trim() || defaultProvider;
  const purposeModel = purposeOverride?.model?.trim();
  const resolvedPurposeModel = readStringSettingValue(
    settings?.[MODEL_KEY_BY_PURPOSE[purpose]],
  );

  if (purposeModel) return purposeModel;
  if (resolvedPurposeModel) return resolvedPurposeModel;
  if (purposeProvider && purposeProvider !== defaultProvider) {
    return getDefaultModelForProvider(purposeProvider);
  }

  return defaultModel;
}

function isLlmPurpose(purpose: LlmModelPurpose): purpose is LlmPurpose {
  return (LLM_PURPOSE_VALUES as readonly string[]).includes(purpose);
}

function getDefaultBaseUrlForProvider(
  provider: string | null | undefined,
): string | null {
  const normalized = provider?.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "ollama") return "http://localhost:11434";
  if (normalized === "lmstudio") return "http://localhost:1234";
  if (normalized === "openai") return "https://api.openai.com";
  if (normalized === "openai_compatible") return "https://api.openai.com";
  if (normalized === "glm") return "https://api.z.ai/api/paas/v4";
  if (normalized === "gemini") {
    return "https://generativelanguage.googleapis.com";
  }
  if (normalized === "gemini_cli" || normalized === "codex") return null;
  return "https://openrouter.ai";
}

function readPurposeApiKeys(raw: string | null | undefined) {
  return settingsRegistry.llmPurposeApiKeys.parse(raw ?? undefined) ?? {};
}

export async function resolveLlmModel(
  purpose: LlmModelPurpose = "default",
): Promise<string> {
  const settings = await getEffectiveSettings();
  return resolveModelFromSettings(settings, purpose);
}

export async function resolveLlmRuntimeSettings(
  purpose: LlmModelPurpose = "default",
): Promise<{
  model: string;
  provider: string | null;
  baseUrl: string | null;
  apiKey: string | null;
}> {
  const getAllSettings =
    "getAllSettings" in settingsRepo ? settingsRepo.getAllSettings : null;
  const [settings, overrides] = await Promise.all([
    getEffectiveSettings(),
    typeof getAllSettings === "function"
      ? getAllSettings()
      : Promise.resolve({} as Partial<Record<settingsRepo.SettingKey, string>>),
  ]);
  const model = resolveModelFromSettings(settings, purpose);
  const defaultProvider = readStringSettingValue(settings?.llmProvider);
  const defaultBaseUrl = readStringSettingValue(settings?.llmBaseUrl);
  const purposeOverride = isLlmPurpose(purpose)
    ? settings?.llmPurposeOverrides?.value?.[purpose]
    : undefined;
  const provider = purposeOverride?.provider?.trim() || defaultProvider;
  const baseUrl =
    purposeOverride?.baseUrl?.trim() ||
    (provider === defaultProvider ? defaultBaseUrl : null) ||
    getDefaultBaseUrlForProvider(provider);
  const purposeApiKeys = readPurposeApiKeys(overrides?.llmPurposeApiKeys);
  const purposeApiKey =
    isLlmPurpose(purpose) && purposeApiKeys[purpose]?.trim()
      ? purposeApiKeys[purpose]?.trim()
      : null;

  return {
    model,
    provider,
    baseUrl,
    apiKey:
      purposeApiKey ||
      overrides?.llmApiKey ||
      getOriginalEnvValue("LLM_API_KEY") ||
      null,
  };
}

export async function createConfiguredLlmService(
  purpose: LlmModelPurpose = "default",
): Promise<LlmService> {
  const runtime = await resolveLlmRuntimeSettings(purpose);
  return new LlmService({
    provider: runtime.provider,
    baseUrl: runtime.baseUrl,
    apiKey: runtime.apiKey,
  });
}
