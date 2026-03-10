declare const __APP_VERSION__: string;

const GITHUB_REPO = "DaKheera47/job-ops";
const STORAGE_KEY = "jobops_version_check";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

function canUseStorage(): boolean {
  return (
    typeof localStorage !== "undefined" &&
    typeof localStorage.getItem === "function" &&
    typeof localStorage.setItem === "function"
  );
}

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  lastChecked: number;
}

/**
 * Normalize the app version into the user-facing release format.
 */
export function parseVersion(rawVersion: string): string {
  const normalized = rawVersion.trim();
  if (/^v\d+\.\d+\.\d+$/.test(normalized)) {
    return normalized;
  }
  if (/^\d+\.\d+\.\d+$/.test(normalized)) {
    return `v${normalized}`;
  }
  return normalized || "unknown";
}

/**
 * Check for updates against GitHub releases API.
 * Results are cached for 24 hours to avoid rate limits.
 */
export async function checkForUpdate(): Promise<VersionCheckResult> {
  const currentRaw =
    typeof __APP_VERSION__ !== "undefined"
      ? (__APP_VERSION__ as string)
      : "unknown";
  const currentVersion = parseVersion(currentRaw);

  // Check cached result
  const cached = canUseStorage() ? localStorage.getItem(STORAGE_KEY) : null;
  if (cached) {
    try {
      const parsed: VersionCheckResult = JSON.parse(cached);
      const timeSinceCheck = Date.now() - parsed.lastChecked;
      if (timeSinceCheck < CHECK_INTERVAL_MS) {
        return { ...parsed, currentVersion };
      }
    } catch {
      // Invalid cache, continue to fetch
    }
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    );
    if (!response.ok) throw new Error("Failed to fetch");

    const data: unknown = await response.json();
    if (
      !data ||
      typeof data !== "object" ||
      typeof (data as { tag_name?: unknown }).tag_name !== "string" ||
      !(data as { tag_name: string }).tag_name.trim()
    ) {
      throw new Error("Invalid response format");
    }
    const latestVersion = parseVersion((data as { tag_name: string }).tag_name);

    const updateAvailable =
      currentVersion !== "unknown" && latestVersion !== currentVersion;

    const result: VersionCheckResult = {
      currentVersion,
      latestVersion,
      updateAvailable,
      lastChecked: Date.now(),
    };

    if (canUseStorage()) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    }
    return result;
  } catch {
    // On error, return current version with no update info
    return {
      currentVersion,
      latestVersion: null,
      updateAvailable: false,
      lastChecked: Date.now(),
    };
  }
}
