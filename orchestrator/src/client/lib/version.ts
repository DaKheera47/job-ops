declare const __APP_VERSION__: string;

const GITHUB_REPO = "DaKheera47/job-ops";
const STORAGE_KEY = "jobops_version_check";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface VersionCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  lastChecked: number;
}

/**
 * Parse git version string into display format.
 * - Clean semver tags (v0.1.12) → v0.1.12
 * - Dev builds (v0.1.12-8-gabc123) → abc123-dev
 */
export function parseVersion(rawVersion: string): string {
  // If it's a clean semver tag (v0.1.12), return as-is
  if (/^v\d+\.\d+\.\d+$/.test(rawVersion)) {
    return rawVersion;
  }
  // If it's a dev build (v0.1.12-8-gabc123), extract commit hash and add -dev
  const match = rawVersion.match(/-g([a-f0-9]+)$/);
  if (match) {
    return `${match[1].slice(0, 7)}-dev`;
  }
  // Fallback: return shortened hash
  return rawVersion.length > 7
    ? `${rawVersion.slice(0, 7)}-dev`
    : `${rawVersion}-dev`;
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
  const cached = localStorage.getItem(STORAGE_KEY);
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
    const latestVersion = (data as { tag_name: string }).tag_name;

    // Update available if current is a clean tag and differs from latest
    const updateAvailable =
      /^v\d+\.\d+\.\d+$/.test(currentRaw) && latestVersion !== currentRaw;

    const result: VersionCheckResult = {
      currentVersion,
      latestVersion,
      updateAvailable,
      lastChecked: Date.now(),
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
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
