const HOSTED_LOCAL_PROVIDERS = new Set(["ollama", "lmstudio", "lm_studio"]);

function normalizeProvider(provider: string | null | undefined): string {
  return provider?.trim().toLowerCase().replace(/[-.]/g, "_") ?? "";
}

export function isHostedLocalProvider(
  provider: string | null | undefined,
): boolean {
  return HOSTED_LOCAL_PROVIDERS.has(normalizeProvider(provider));
}

export function isSafeHostedBaseUrl(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname === "0.0.0.0" ||
      hostname === "127.0.0.1" ||
      hostname === "169.254.169.254" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
