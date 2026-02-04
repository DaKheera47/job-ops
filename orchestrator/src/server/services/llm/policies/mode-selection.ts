import type { ResponseMode } from "../types";

const modeCache = new Map<string, ResponseMode>();

export function buildModeCacheKey(provider: string, baseUrl: string): string {
  return `${provider}:${baseUrl}`;
}

export function getOrderedModes(
  cacheKey: string,
  modes: ResponseMode[],
): ResponseMode[] {
  const cachedMode = modeCache.get(cacheKey);
  return cachedMode
    ? [cachedMode, ...modes.filter((mode) => mode !== cachedMode)]
    : modes;
}

export function rememberSuccessfulMode(
  cacheKey: string,
  mode: ResponseMode,
): void {
  modeCache.set(cacheKey, mode);
}

export function clearModeCache(): void {
  modeCache.clear();
}
