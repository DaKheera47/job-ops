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
 * Falls back to vanilla Firefox if Camoufox fails to initialize.
 *
 * This centralizes the launch config so all extractors use the same
 * anti-detection settings. Update this one place when Camoufox options change.
 *
 * @returns Launch options and a flag indicating whether Camoufox was used
 */
export async function createLaunchOptions(
  options: BrowserLaunchOptions = {},
): Promise<{ launchOptions: LaunchOptions; usedCamoufox: boolean }> {
  const merged = { ...DEFAULTS, ...options };

  try {
    const { launchOptions } = await import("camoufox-js");

    const opts = await launchOptions({
      headless: merged.headless,
      humanize: merged.humanize,
      geoip: merged.geoip,
      block_webrtc: merged.block_webrtc,
      args: options.args,
    });

    return { launchOptions: opts, usedCamoufox: true };
  } catch (error) {
    // Camoufox binary missing or incompatible — fall back to vanilla Firefox.
    // This happens in CI or when the binary hasn't been fetched yet.
    console.warn(
      `[browser-utils] Camoufox unavailable, falling back to vanilla Firefox: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );

    return {
      launchOptions: {
        headless: merged.headless,
        args: options.args,
      },
      usedCamoufox: false,
    };
  }
}
