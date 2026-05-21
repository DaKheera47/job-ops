import { logger } from "@infra/logger";
import * as settingsRepo from "@server/repositories/settings";
import { getOriginalEnvValue } from "@server/services/envSettings";
import {
  getDefaultModelForProvider,
  settingsRegistry,
} from "@shared/settings-registry";
import {
  type AppSettings,
  LLM_PURPOSE_VALUES,
  type LlmPurpose,
  type LlmPurposeApiKeyHints,
  type LlmPurposeApiKeys,
  type LlmPurposeOverrides,
  type ResumeProfile,
} from "@shared/types";
import {
  designResumeToProfile,
  getCurrentDesignResumeOrNullOnLegacy,
} from "./design-resume";
import { getEnvSettingsData } from "./envSettings";
import { getProfile } from "./profile";
import {
  extractProjectsFromProfile,
  resolveResumeProjectsSettings,
} from "./resumeProjects";
import {
  extractProjectsFromResume,
  getResume,
  RxResumeAuthConfigError,
} from "./rxresume";
import { resolveRxResumeBaseResumeId } from "./rxresume/baseResumeId";

function resolveDefaultLlmBaseUrl(provider: string): string {
  const normalized = provider.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "ollama") return "http://localhost:11434";
  if (normalized === "lmstudio") return "http://localhost:1234";
  if (normalized === "openai") {
    return "https://api.openai.com";
  }
  if (normalized === "openai_compatible") {
    return "https://api.openai.com";
  }
  if (normalized === "glm") {
    return "https://api.z.ai/api/paas/v4";
  }
  if (normalized === "gemini") {
    return "https://generativelanguage.googleapis.com";
  }
  if (normalized === "gemini_cli") {
    return "";
  }
  if (normalized === "codex") {
    return "";
  }
  return "https://openrouter.ai";
}

function normalizeModelForProviderCompatibility(
  provider: string | null | undefined,
  model: string | null | undefined,
): string | null {
  const trimmedModel = model?.trim();
  if (!trimmedModel) return null;

  const normalizedProvider = provider?.trim().toLowerCase().replace(/-/g, "_");
  const normalizedModel = trimmedModel.toLowerCase();

  if (normalizedProvider === "openai") {
    if (
      normalizedModel.startsWith("google/") ||
      normalizedModel.startsWith("models/") ||
      normalizedModel.startsWith("gemini")
    ) {
      return null;
    }
  }

  if (normalizedProvider === "gemini" || normalizedProvider === "gemini_cli") {
    const isGeminiModel =
      normalizedModel.startsWith("google/") ||
      normalizedModel.startsWith("models/") ||
      normalizedModel.startsWith("gemini");
    if (!isGeminiModel) {
      return null;
    }
  }

  if (normalizedProvider === "glm") {
    const isGlmModel =
      normalizedModel.startsWith("glm") ||
      normalizedModel.startsWith("charglm");
    if (!isGlmModel) {
      return null;
    }
  }

  return trimmedModel;
}

function isBaseResumeNotConfiguredError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message.includes("Base resume not configured")
  );
}

function readPurposeOverrides(
  overrides: Partial<Record<settingsRepo.SettingKey, string>>,
): LlmPurposeOverrides {
  return (
    settingsRegistry.llmPurposeOverrides.parse(overrides.llmPurposeOverrides) ??
    {}
  );
}

function readPurposeApiKeyHints(
  overrides: Partial<Record<settingsRepo.SettingKey, string>>,
): LlmPurposeApiKeyHints {
  const purposeApiKeys = settingsRegistry.llmPurposeApiKeys.parse(
    overrides.llmPurposeApiKeys,
  ) as LlmPurposeApiKeys | null;
  const hints: LlmPurposeApiKeyHints = {};
  for (const purpose of LLM_PURPOSE_VALUES) {
    const value = purposeApiKeys?.[purpose]?.trim();
    if (!value) continue;
    const hintLength = value.length > 4 ? 4 : Math.max(value.length - 1, 1);
    hints[purpose] = value.slice(0, hintLength);
  }
  return hints;
}

const MODEL_KEY_BY_PURPOSE: Record<
  LlmPurpose,
  "modelScorer" | "modelTailoring" | "modelProjectSelection"
> = {
  scoring: "modelScorer",
  tailoring: "modelTailoring",
  projectSelection: "modelProjectSelection",
};

/**
 * Get the effective app settings, combining environment variables and database overrides.
 */
export async function getEffectiveSettings(): Promise<AppSettings> {
  const getAllSettings =
    "getAllSettings" in settingsRepo ? settingsRepo.getAllSettings : null;
  const overrides =
    (typeof getAllSettings === "function" ? await getAllSettings() : null) ??
    {};
  const providerOverride = settingsRegistry.llmProvider.parse(
    overrides.llmProvider,
  );
  const effectiveLlmProvider =
    providerOverride ?? settingsRegistry.llmProvider.default();
  const purposeOverrides = readPurposeOverrides(overrides);
  const resolvedModelDefault =
    normalizeModelForProviderCompatibility(
      effectiveLlmProvider,
      getDefaultModelForProvider(
        effectiveLlmProvider,
        getOriginalEnvValue("MODEL"),
      ),
    ) ?? getDefaultModelForProvider(effectiveLlmProvider);

  const rxresumeBaseResumeId = resolveRxResumeBaseResumeId({
    rxresumeBaseResumeId: overrides.rxresumeBaseResumeId ?? null,
  });
  let profile: Record<string, unknown> = {};
  let localProfile: ResumeProfile | null = null;

  const localDesignResume = await getCurrentDesignResumeOrNullOnLegacy();
  if (localDesignResume?.resumeJson) {
    localProfile = await designResumeToProfile(localDesignResume.resumeJson);
    profile = (localProfile as Record<string, unknown> | null) ?? {};
  }

  if (Object.keys(profile).length === 0 && rxresumeBaseResumeId) {
    try {
      const resume = await getResume(rxresumeBaseResumeId);
      if (resume.data && typeof resume.data === "object") {
        profile = resume.data as Record<string, unknown>;
      }
    } catch (error) {
      if (error instanceof RxResumeAuthConfigError) {
        logger.warn(
          "Reactive Resume credentials missing during settings load",
          {
            resumeId: rxresumeBaseResumeId,
            error,
          },
        );
      } else {
        logger.warn("Failed to load Reactive Resume base resume for settings", {
          resumeId: rxresumeBaseResumeId,
          error,
        });
      }
    }
  }

  if (Object.keys(profile).length === 0) {
    profile = await getProfile().catch((error) => {
      if (isBaseResumeNotConfiguredError(error)) {
        return {};
      }
      logger.warn("Failed to load base resume profile for settings", { error });
      return {};
    });
  }

  const envSettings = await getEnvSettingsData(overrides);

  const result: Partial<AppSettings> = {
    ...envSettings,
    llmPurposeApiKeyHints: readPurposeApiKeyHints(overrides),
  };

  const rawModel = overrides.model;
  const modelDef = settingsRegistry.model;
  const overrideModel = normalizeModelForProviderCompatibility(
    effectiveLlmProvider,
    modelDef.parse(rawModel),
  );
  const modelValue = overrideModel ?? resolvedModelDefault;

  for (const [key, def] of Object.entries(settingsRegistry)) {
    if (def.kind === "typed") {
      let rawOverride = overrides[key as settingsRepo.SettingKey];
      if (key === "searchCities" && !rawOverride) {
        rawOverride = overrides.jobspyLocation; // legacy fallback
      }

      let override = def.parse(rawOverride);
      let defaultValue = def.default();

      if (key === "model") {
        defaultValue = resolvedModelDefault;
        override = overrideModel;
      }

      if (key === "llmBaseUrl") {
        const provider =
          effectiveLlmProvider ?? settingsRegistry.llmProvider.default();
        defaultValue =
          getOriginalEnvValue("LLM_BASE_URL") ||
          resolveDefaultLlmBaseUrl(provider);
      }

      if (key === "resumeProjects") {
        let catalog: AppSettings["profileProjects"] = [];
        if (Object.keys(profile).length > 0) {
          try {
            catalog = localProfile
              ? extractProjectsFromProfile(localProfile).catalog
              : extractProjectsFromResume(profile).catalog;
          } catch (error) {
            logger.warn("Failed to extract projects from resume data", {
              error,
            });
          }
        }
        const resolved = resolveResumeProjectsSettings({
          catalog,
          overrideRaw: rawOverride ?? null,
        });
        result.profileProjects = resolved.profileProjects;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // biome-ignore lint/suspicious/noExplicitAny: dynamic assignment for settings building
        (result as any).resumeProjects = {
          value: resolved.resumeProjects,
          default: resolved.defaultResumeProjects,
          override: resolved.overrideResumeProjects,
        };
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // biome-ignore lint/suspicious/noExplicitAny: dynamic assignment for settings building
      (result as any)[key] = {
        value: override ?? defaultValue,
        default: defaultValue,
        override,
      };
    } else if (def.kind === "model") {
      const purpose = (
        Object.entries(MODEL_KEY_BY_PURPOSE) as Array<
          [LlmPurpose, keyof typeof settingsRegistry]
        >
      ).find(([, modelKey]) => modelKey === key)?.[0];
      const purposeOverride = purpose ? purposeOverrides[purpose] : undefined;
      const purposeProvider = purposeOverride?.provider ?? effectiveLlmProvider;
      const purposeModelDefault =
        purposeProvider === effectiveLlmProvider
          ? modelValue
          : getDefaultModelForProvider(purposeProvider);
      const override =
        normalizeModelForProviderCompatibility(
          purposeProvider,
          purposeOverride?.model ??
            overrides[key as settingsRepo.SettingKey] ??
            null,
        ) ?? null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // biome-ignore lint/suspicious/noExplicitAny: dynamic assignment for settings building
      (result as any)[key] = {
        value: override || purposeModelDefault,
        override,
      };
    } else if (def.kind === "string") {
      if (!("envKey" in def) || !def.envKey) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        // biome-ignore lint/suspicious/noExplicitAny: dynamic assignment for settings building
        (result as any)[key] =
          overrides[key as settingsRepo.SettingKey] ?? null;
      }
    }
  }

  // Always expose the effective base resume id for the active RxResume mode.
  result.rxresumeBaseResumeId = rxresumeBaseResumeId;

  return result as AppSettings;
}
