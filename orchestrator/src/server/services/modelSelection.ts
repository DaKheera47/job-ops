import { getJobOpsAppConfig } from "@server/config/app-mode";
import * as settingsRepo from "@server/repositories/settings";
import { getCurrentAccountEntitlements } from "@server/services/account-entitlements";
import { getOriginalEnvValue } from "@server/services/envSettings";
import { resolveLlmApiKey } from "@server/services/llm/credentials";
import { isHostedLocalProvider } from "@server/services/llm/hosted-policy";
import { LlmService } from "@server/services/llm/service";
import { getEffectiveSettings } from "@server/services/settings";
import {
  getDefaultModelForProvider,
  settingsRegistry,
} from "@shared/settings-registry";
import { LLM_PURPOSE_VALUES, type LlmPurpose } from "@shared/types";

export type LlmModelPurpose = "default" | LlmPurpose;

export type LlmRuntimeSettings = {
  model: string;
  provider: string | null;
  baseUrl: string | null;
  apiKey: string | null;
  allowEnvironmentCredentials: boolean;
  allowCliProviders: boolean;
};

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
  if (normalized === "anthropic" || normalized === "claude") {
    return "https://api.anthropic.com";
  }
  if (normalized === "openai_compatible") return "https://api.openai.com";
  if (normalized === "glm") return "https://api.z.ai/api/paas/v4";
  if (normalized === "gemini") {
    return "https://generativelanguage.googleapis.com";
  }
  if (
    normalized === "gemini_cli" ||
    normalized === "claude_cli" ||
    normalized === "codex"
  )
    return null;
  if (normalized === "requesty") return "https://router.requesty.ai/v1";
  if (normalized === "orcarouter") return "https://api.orcarouter.ai/v1";
  return "https://openrouter.ai";
}

function providerUsesConfiguredBaseUrl(
  provider: string | null | undefined,
): boolean {
  const normalized = provider?.trim().toLowerCase().replace(/[-.]/g, "_");
  return (
    normalized === "lmstudio" ||
    normalized === "ollama" ||
    normalized === "openai_compatible" ||
    normalized === "glm"
  );
}

function readPurposeApiKeys(raw: string | null | undefined) {
  return settingsRegistry.llmPurposeApiKeys.parse(raw ?? undefined) ?? {};
}

function isCliProvider(provider: string | null | undefined): boolean {
  return ["codex", "gemini_cli", "claude_cli"].includes(provider ?? "");
}

async function resolveHostedLlmRuntimeSettings(
  purpose: LlmModelPurpose,
): Promise<LlmRuntimeSettings> {
  const entitlements = await getCurrentAccountEntitlements();
  if (entitlements.platformAiIncluded) {
    const provider =
      settingsRegistry.llmProvider.parse(getOriginalEnvValue("LLM_PROVIDER")) ??
      "openrouter";
    return {
      provider,
      model: getDefaultModelForProvider(provider, getOriginalEnvValue("MODEL")),
      baseUrl:
        (providerUsesConfiguredBaseUrl(provider)
          ? getOriginalEnvValue("LLM_BASE_URL")?.trim()
          : null) || getDefaultBaseUrlForProvider(provider),
      apiKey: resolveLlmApiKey({ provider }),
      allowEnvironmentCredentials: true,
      allowCliProviders: true,
    };
  }

  const overrides = await settingsRepo.getAllSettings();
  const purposeOverrides =
    settingsRegistry.llmPurposeOverrides.parse(overrides.llmPurposeOverrides) ??
    {};
  const purposeOverride = isLlmPurpose(purpose)
    ? purposeOverrides[purpose]
    : undefined;
  const selectedProvider =
    purposeOverride?.provider ??
    settingsRegistry.llmProvider.parse(overrides.llmProvider) ??
    "openrouter";
  const provider =
    isCliProvider(selectedProvider) || isHostedLocalProvider(selectedProvider)
      ? "openrouter"
      : selectedProvider;
  const defaultModel =
    settingsRegistry.model.parse(overrides.model) ??
    getDefaultModelForProvider(provider);
  const purposeModelKey = isLlmPurpose(purpose)
    ? MODEL_KEY_BY_PURPOSE[purpose]
    : null;
  const model =
    purposeOverride?.model?.trim() ||
    (purposeModelKey ? overrides[purposeModelKey]?.trim() : null) ||
    defaultModel;
  const purposeApiKeys = readPurposeApiKeys(overrides.llmPurposeApiKeys);

  return {
    provider,
    model,
    baseUrl: getDefaultBaseUrlForProvider(provider),
    apiKey: resolveLlmApiKey({
      purposeApiKey: isLlmPurpose(purpose) ? purposeApiKeys[purpose] : null,
      storedApiKey: overrides.llmApiKey,
      provider,
      allowEnvironmentCredentials: false,
    }),
    allowEnvironmentCredentials: false,
    allowCliProviders: false,
  };
}

export async function resolveLlmModel(
  purpose: LlmModelPurpose = "default",
): Promise<string> {
  if (getJobOpsAppConfig().appMode === "hosted") {
    return (await resolveHostedLlmRuntimeSettings(purpose)).model;
  }
  const settings = await getEffectiveSettings();
  return resolveModelFromSettings(settings, purpose);
}

export async function resolveLlmRuntimeSettings(
  purpose: LlmModelPurpose = "default",
): Promise<LlmRuntimeSettings> {
  if (getJobOpsAppConfig().appMode === "hosted") {
    return resolveHostedLlmRuntimeSettings(purpose);
  }

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
  const configuredBaseUrl = providerUsesConfiguredBaseUrl(provider)
    ? purposeOverride?.baseUrl?.trim() ||
      (provider === defaultProvider ? defaultBaseUrl : null)
    : null;
  const baseUrl = configuredBaseUrl || getDefaultBaseUrlForProvider(provider);
  const purposeApiKeys = readPurposeApiKeys(overrides?.llmPurposeApiKeys);
  const purposeApiKey =
    isLlmPurpose(purpose) && purposeApiKeys[purpose]?.trim()
      ? purposeApiKeys[purpose]?.trim()
      : null;

  return {
    model,
    provider,
    baseUrl,
    apiKey: resolveLlmApiKey({
      purposeApiKey,
      storedApiKey: overrides?.llmApiKey,
      provider,
    }),
    allowEnvironmentCredentials: true,
    allowCliProviders: true,
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
    allowEnvironmentCredentials: runtime.allowEnvironmentCredentials,
    allowCliProviders: runtime.allowCliProviders,
  });
}
