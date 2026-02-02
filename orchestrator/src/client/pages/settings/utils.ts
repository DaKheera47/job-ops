/**
 * Settings page helpers.
 */

import type { ResumeProjectsSettings } from "@shared/types";
import { arraysEqual } from "@/lib/utils";

export function resumeProjectsEqual(
  a: ResumeProjectsSettings,
  b: ResumeProjectsSettings,
) {
  return (
    a.maxProjects === b.maxProjects &&
    arraysEqual(a.lockedProjectIds, b.lockedProjectIds) &&
    arraysEqual(a.aiSelectableProjectIds, b.aiSelectableProjectIds)
  );
}

export const formatSecretHint = (hint: string | null) =>
  hint ? `${hint}********` : "Not set";

export const LLM_PROVIDERS = [
  "openrouter",
  "lmstudio",
  "ollama",
  "openai",
  "gemini",
] as const;

export type LlmProviderId = (typeof LLM_PROVIDERS)[number];

export const LLM_PROVIDER_LABELS: Record<LlmProviderId, string> = {
  openrouter: "OpenRouter",
  lmstudio: "LM Studio",
  ollama: "Ollama",
  openai: "OpenAI",
  gemini: "Gemini",
};

export function normalizeLlmProvider(
  value: string | null | undefined,
): LlmProviderId {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "openrouter";
  return (LLM_PROVIDERS as readonly string[]).includes(normalized)
    ? (normalized as LlmProviderId)
    : "openrouter";
}

export function getLlmProviderConfig(provider: string | null | undefined) {
  const normalizedProvider = normalizeLlmProvider(provider);
  const showApiKey = ["openrouter", "openai", "gemini"].includes(
    normalizedProvider,
  );
  const showBaseUrl = ["lmstudio", "ollama"].includes(normalizedProvider);
  const baseUrlPlaceholder =
    normalizedProvider === "ollama"
      ? "http://localhost:11434"
      : "http://localhost:1234";
  const baseUrlHelper =
    normalizedProvider === "ollama"
      ? "Default: http://localhost:11434"
      : "Default: http://localhost:1234";
  const providerHint =
    normalizedProvider === "ollama"
      ? "Ollama typically runs locally and does not require an API key."
      : normalizedProvider === "lmstudio"
        ? "LM Studio runs locally via its OpenAI-compatible server."
        : normalizedProvider === "openai"
          ? "OpenAI uses the Responses API with structured outputs."
          : normalizedProvider === "gemini"
            ? "Gemini uses the native AI Studio API and requires a key."
            : "OpenRouter uses your API key and supports model routing across providers.";
  const keyHelper =
    normalizedProvider === "openai"
      ? "Create a key at platform.openai.com"
      : normalizedProvider === "gemini"
        ? "Create a key at ai.google.dev"
        : "Create a key at openrouter.ai";
  return {
    normalizedProvider,
    label: LLM_PROVIDER_LABELS[normalizedProvider],
    showApiKey,
    showBaseUrl,
    requiresApiKey: showApiKey,
    baseUrlPlaceholder,
    baseUrlHelper,
    providerHint,
    keyHelper,
  };
}
