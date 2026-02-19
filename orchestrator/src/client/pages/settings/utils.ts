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

const PROVIDERS_WITH_API_KEY = new Set<LlmProviderId>([
  "openrouter",
  "openai",
  "gemini",
]);

const PROVIDERS_WITH_BASE_URL = new Set<LlmProviderId>(["lmstudio", "ollama"]);

const PROVIDER_HINTS: Record<LlmProviderId, string> = {
  openrouter:
    "OpenRouter uses your API key and supports model routing across providers.",
  lmstudio: "LM Studio runs locally via its OpenAI-compatible server.",
  ollama: "Ollama typically runs locally and does not require an API key.",
  openai: "OpenAI uses the Responses API with structured outputs.",
  gemini: "Gemini uses the native AI Studio API and requires a key.",
};

const PROVIDER_KEY_HELPERS: Record<LlmProviderId, string> = {
  openrouter: "Create a key at openrouter.ai",
  lmstudio: "No API key required for LM Studio",
  ollama: "No API key required for Ollama",
  openai: "Create a key at platform.openai.com",
  gemini: "Create a key at aistudio.google.com/api-keys",
};

const BASE_URL_PROVIDERS = ["lmstudio", "ollama"] as const;
type BaseUrlProviderId = (typeof BASE_URL_PROVIDERS)[number];

const PROVIDER_BASE_URLS: Record<BaseUrlProviderId, string> = {
  lmstudio: "http://localhost:1234",
  ollama: "http://localhost:11434",
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
  const showApiKey = PROVIDERS_WITH_API_KEY.has(normalizedProvider);
  const showBaseUrl = PROVIDERS_WITH_BASE_URL.has(normalizedProvider);
  const baseUrlPlaceholder = showBaseUrl
    ? PROVIDER_BASE_URLS[normalizedProvider as BaseUrlProviderId]
    : "";
  const baseUrlHelper = showBaseUrl ? `Default: ${baseUrlPlaceholder}` : "";
  const providerHint = PROVIDER_HINTS[normalizedProvider];
  const keyHelper = PROVIDER_KEY_HELPERS[normalizedProvider];

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
