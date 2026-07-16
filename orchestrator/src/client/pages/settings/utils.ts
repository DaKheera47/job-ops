/**
 * Settings page helpers.
 */

import { mapGlmProviderAlias } from "@shared/settings-registry";
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
  "anthropic",
  "openai_compatible",
  "glm",
  "gemini",
  "gemini_cli",
  "claude_cli",
  "codex",
] as const;

export type LlmProviderId = (typeof LLM_PROVIDERS)[number];
export const LLM_MODEL_SUGGESTION_PROVIDERS = [
  "openai",
  "anthropic",
  "glm",
  "gemini",
  "gemini_cli",
  "claude_cli",
  "ollama",
] as const;

export const LLM_PROVIDER_LABELS: Record<LlmProviderId, string> = {
  openrouter: "OpenRouter",
  lmstudio: "LM Studio",
  ollama: "Ollama",
  openai: "OpenAI",
  anthropic: "Claude (Anthropic)",
  openai_compatible: "OpenAI-compatible",
  glm: "GLM",
  gemini: "Gemini",
  gemini_cli: "Gemini (CLI)",
  claude_cli: "Claude (CLI)",
  codex: "Codex",
};

const PROVIDERS_WITH_API_KEY = new Set<LlmProviderId>([
  "openrouter",
  "openai",
  "anthropic",
  "openai_compatible",
  "glm",
  "gemini",
]);

const PROVIDERS_WITH_OPTIONAL_API_KEY = new Set<LlmProviderId>(["ollama"]);

const PROVIDERS_WITH_BASE_URL = new Set<LlmProviderId>([
  "lmstudio",
  "ollama",
  "openai_compatible",
  "glm",
]);

const PROVIDER_HINTS: Record<LlmProviderId, string> = {
  openrouter:
    "OpenRouter uses your API key and supports model routing across providers.",
  lmstudio: "LM Studio runs locally via its OpenAI-compatible server.",
  ollama:
    "Ollama typically runs locally. Add an API key only for Ollama-compatible endpoints protected by bearer auth.",
  openai: "OpenAI uses the Responses API with structured outputs.",
  anthropic:
    "Claude uses Anthropic's native Messages API with your Anthropic API key.",
  openai_compatible:
    "Use a bearer token with any chat-completions-compatible endpoint.",
  glm: "GLM uses the Z.AI chat completions API (OpenAI-compatible) with your API key.",
  gemini: "Gemini uses the native AI Studio API and requires a key.",
  gemini_cli:
    "Gemini (CLI) runs the official Google Gemini CLI on this host using your OAuth session or CLI API key — no JobOps LLM key.",
  claude_cli:
    "Claude (CLI) runs the official Claude Code CLI on this host using your subscription token or API key — no JobOps LLM key.",
  codex:
    "Codex runs through a local app-server process and uses your Codex login session.",
};

const PROVIDER_KEY_HELPERS: Record<
  LlmProviderId,
  { text: string; href?: string }
> = {
  openrouter: {
    text: "Create a key at openrouter.ai",
    href: "https://openrouter.ai/keys",
  },
  lmstudio: { text: "No API key required for LM Studio" },
  ollama: {
    text: "Optional bearer token for Ollama-compatible endpoints that require auth",
  },
  openai: {
    text: "Create a key at platform.openai.com",
    href: "https://platform.openai.com/api-keys",
  },
  anthropic: {
    text: "Create a key at platform.claude.com",
    href: "https://platform.claude.com/settings/keys",
  },
  openai_compatible: {
    text: "Use the bearer token issued by your compatible provider",
  },
  glm: {
    text: "Create a key at z.ai",
    href: "https://z.ai/manage-apikey/apikey-list",
  },
  gemini: {
    text: "Create a key at aistudio.google.com/api-keys",
    href: "https://aistudio.google.com/app/apikey",
  },
  gemini_cli: {
    text: "Authenticate with the Gemini CLI (gemini login / OAuth); see docs link below",
  },
  claude_cli: {
    text: "Authenticate with the Claude CLI (claude setup-token); see docs link below",
  },
  codex: { text: "No API key required when Codex is authenticated locally" },
};

const BASE_URL_PROVIDERS = [
  "lmstudio",
  "ollama",
  "openai_compatible",
  "glm",
] as const;
type BaseUrlProviderId = (typeof BASE_URL_PROVIDERS)[number];

const PROVIDER_BASE_URLS: Record<BaseUrlProviderId, string> = {
  lmstudio: "http://localhost:1234",
  ollama: "http://localhost:11434",
  openai_compatible: "https://api.example.com/v1/chat/completions",
  glm: "https://api.z.ai/api/paas/v4",
};

export function normalizeLlmProvider(
  value: string | null | undefined,
): LlmProviderId {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "openrouter";
  const normalizedId = normalized.replace(/[-.]/g, "_");
  if (normalizedId === "claude") return "anthropic";
  if (normalizedId === "openai_compatible") return "openai_compatible";
  const mapped = mapGlmProviderAlias(normalizedId);
  return (LLM_PROVIDERS as readonly string[]).includes(mapped)
    ? (mapped as LlmProviderId)
    : "openrouter";
}

export function supportsLlmModelSuggestions(
  provider: string | null | undefined,
): boolean {
  const normalizedProvider = normalizeLlmProvider(provider);
  return (LLM_MODEL_SUGGESTION_PROVIDERS as readonly string[]).includes(
    normalizedProvider,
  );
}

export function getLlmProviderConfig(provider: string | null | undefined) {
  const normalizedProvider = normalizeLlmProvider(provider);
  const requiresApiKey = PROVIDERS_WITH_API_KEY.has(normalizedProvider);
  const showApiKey =
    requiresApiKey || PROVIDERS_WITH_OPTIONAL_API_KEY.has(normalizedProvider);
  const showBaseUrl = PROVIDERS_WITH_BASE_URL.has(normalizedProvider);
  const baseUrlPlaceholder = showBaseUrl
    ? PROVIDER_BASE_URLS[normalizedProvider as BaseUrlProviderId]
    : "";
  const baseUrlHelper = showBaseUrl
    ? normalizedProvider === "openai_compatible"
      ? "Enter a base URL or a full /v1/chat/completions endpoint."
      : normalizedProvider === "ollama"
        ? "Default: http://localhost:11434. From Docker Desktop, use http://host.docker.internal:11434. On Linux Docker, use a container-reachable host gateway such as http://172.17.0.1:11434."
        : `Default: ${baseUrlPlaceholder}`
    : "";
  const providerHint = PROVIDER_HINTS[normalizedProvider];
  const keyHelper = PROVIDER_KEY_HELPERS[normalizedProvider];

  return {
    normalizedProvider,
    label: LLM_PROVIDER_LABELS[normalizedProvider],
    showApiKey,
    showBaseUrl,
    requiresApiKey,
    baseUrlPlaceholder,
    baseUrlHelper,
    providerHint,
    keyHelperText: keyHelper.text,
    keyHelperHref: keyHelper.href ?? null,
  };
}
