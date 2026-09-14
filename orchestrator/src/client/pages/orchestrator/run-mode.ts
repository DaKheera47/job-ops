import { getAuthScopedStorageKey } from "@/client/api/client";

export type RunMode = "automatic" | "manual";

export const RUN_MODE_STORAGE_KEY = "jobops.pipeline.run-mode.v1";

export function loadRunMode(): RunMode {
  try {
    return localStorage.getItem(
      getAuthScopedStorageKey(RUN_MODE_STORAGE_KEY),
    ) === "manual"
      ? "manual"
      : "automatic";
  } catch {
    return "automatic";
  }
}

export function saveRunMode(mode: RunMode): void {
  try {
    localStorage.setItem(getAuthScopedStorageKey(RUN_MODE_STORAGE_KEY), mode);
  } catch {
    // Ignore localStorage failures.
  }
}
