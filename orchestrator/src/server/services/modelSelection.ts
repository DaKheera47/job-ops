import * as settingsRepo from "@server/repositories/settings";
import { getEffectiveSettings } from "@server/services/settings";

export type LlmModelPurpose =
  | "default"
  | "scoring"
  | "tailoring"
  | "projectSelection";

export async function resolveLlmModel(
  purpose: LlmModelPurpose = "default",
): Promise<string> {
  const settings = await getEffectiveSettings();

  if (purpose === "scoring") {
    return settings.modelScorer.value || settings.model.value;
  }

  if (purpose === "tailoring") {
    return settings.modelTailoring.value || settings.model.value;
  }

  if (purpose === "projectSelection") {
    return settings.modelProjectSelection.value || settings.model.value;
  }

  return settings.model.value;
}

export async function resolveLlmRuntimeSettings(
  purpose: LlmModelPurpose = "default",
): Promise<{
  model: string;
  provider: string | null;
  baseUrl: string | null;
  apiKey: string | null;
}> {
  const [settings, overrides] = await Promise.all([
    getEffectiveSettings(),
    settingsRepo.getAllSettings(),
  ]);

  const model =
    purpose === "scoring"
      ? settings.modelScorer.value || settings.model.value
      : purpose === "tailoring"
        ? settings.modelTailoring.value || settings.model.value
        : purpose === "projectSelection"
          ? settings.modelProjectSelection.value || settings.model.value
          : settings.model.value;

  return {
    model,
    provider: settings.llmProvider.value ?? null,
    baseUrl: settings.llmBaseUrl.value ?? null,
    apiKey: overrides.llmApiKey || process.env.LLM_API_KEY || null,
  };
}
