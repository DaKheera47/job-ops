import type { LaunchOptions } from "playwright";

export interface BrowserLaunchOptions {
  /** Run headless (default true) */
  headless?: boolean;
  /** Enable Camoufox humanization — random mouse movements, typing delays (default true) */
  humanize?: boolean;
  /** Spoof geolocation based on IP (default true) */
  geoip?: boolean;
  /** Block WebRTC to prevent IP leaks (default true) */
  block_webrtc?: boolean;
  /** Additional args passed to the browser */
  args?: string[];
}

const DEFAULTS: Required<Omit<BrowserLaunchOptions, "args">> = {
  headless: true,
  humanize: true,
  geoip: true,
  block_webrtc: true,
  // block_images intentionally NOT set — camoufox docs warn it triggers WAF
  // detection because CF checks whether images are loaded by the browser
};

/**
 * Creates Playwright launch options using Camoufox for anti-detection.
 *
 * Camoufox is baked into the production Docker image via the `camoufox-cache`
 * build stage and is the only supported browser. There is no vanilla Firefox
 * fallback: if Camoufox is unavailable it means the image was built incorrectly
 * or the binary was not fetched, and we want that to surface as an immediate
 * hard failure rather than silently degrading anti-detection in production.
 *
 * This centralizes the launch config so all extractors use the same
 * anti-detection settings. Update this one place when Camoufox options change.
 *
 * @returns Launch options for use with playwright's firefox.launch()
 */
export async function createLaunchOptions(
  options: BrowserLaunchOptions = {},
): Promise<{ launchOptions: LaunchOptions; usedCamoufox: true }> {
  const merged = { ...DEFAULTS, ...options };

  const { launchOptions } = await import("camoufox-js");

  const opts = await launchOptions({
    headless: merged.headless,
    humanize: merged.humanize,
    geoip: merged.geoip,
    block_webrtc: merged.block_webrtc,
    args: options.args,
  });

  return { launchOptions: opts, usedCamoufox: true };
}
