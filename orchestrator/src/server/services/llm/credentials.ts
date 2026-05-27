import { getOriginalEnvValue } from "@server/services/envSettings";
import { toStringOrNull } from "@shared/utils/type-conversion";

function normalizeStoredApiKey(
  value: string | null | undefined,
): string | null {
  return toStringOrNull(value);
}

function normalizeProviderName(
  provider: string | null | undefined,
): string | null {
  const normalized = provider?.trim().toLowerCase().replace(/[-.]/g, "_");
  return normalized || null;
}

/**
 * Resolve the effective LLM API key from stored settings and environment.
 * Matches LlmService constructor behavior so onboarding, imports, and pipeline
 * agree on whether credentials are configured.
 */
export function resolveLlmApiKey(options: {
  storedApiKey?: string | null;
  purposeApiKey?: string | null;
  provider?: string | null;
}): string | null {
  const purposeApiKey = normalizeStoredApiKey(options.purposeApiKey);
  if (purposeApiKey) return purposeApiKey;

  const storedApiKey = normalizeStoredApiKey(options.storedApiKey);
  if (storedApiKey) return storedApiKey;

  const envApiKey = toStringOrNull(getOriginalEnvValue("LLM_API_KEY"));
  if (envApiKey) return envApiKey;

  const provider = normalizeProviderName(options.provider);
  if (
    provider === "openrouter" &&
    toStringOrNull(getOriginalEnvValue("OPENROUTER_API_KEY"))
  ) {
    return toStringOrNull(getOriginalEnvValue("OPENROUTER_API_KEY"));
  }

  return null;
}
