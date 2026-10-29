/** Server/extractor configuration only; never expose solver credentials to clients. */
export function isCapsolverConfigured(): boolean {
  return Boolean(process.env.CAPSOLVER_API_KEY?.trim());
}

export function getCapsolverProxyUrl(): string | undefined {
  if (!isCapsolverConfigured()) return undefined;
  const raw = process.env.CAPSOLVER_PROXY?.trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      throw new Error();
    }
    return url.toString();
  } catch {
    // Proxy URLs can contain credentials. Never include the input in errors.
    throw new Error("CAPSOLVER_PROXY must be an HTTP(S) proxy URL.");
  }
}
