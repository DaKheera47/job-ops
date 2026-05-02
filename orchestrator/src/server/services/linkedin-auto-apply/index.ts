import { logger } from "@infra/logger";
import type { LinkedInSessionStatus } from "@shared/types";
import { firefox } from "playwright";
import {
  ensureChallengeViewer,
  createChallengeViewerSession,
  buildChallengeViewerUrl,
} from "../challenge-viewer";
import {
  executeEasyApply,
  type EasyApplyOptions,
  type EasyApplyResult,
} from "./easy-apply";
import { resetProgress } from "./progress";
import {
  invalidateLinkedInCookies,
  loadLinkedInCookies,
  readLinkedInCookieJar,
  saveLinkedInCookies,
  verifyLinkedInSession,
  waitForLogin,
} from "./session";

export { subscribeToLinkedInApplyProgress, getLinkedInApplyProgress } from "./progress";
export type { EasyApplyResult } from "./easy-apply";

let busy = false;
let activeAbort: AbortController | null = null;
let lastVerifiedAt: string | null = null;

export async function getLinkedInSessionStatus(): Promise<LinkedInSessionStatus> {
  const jar = await readLinkedInCookieJar();
  return {
    authenticated: jar.hasCookies,
    lastVerifiedAt,
  };
}

export async function startLinkedInLogin(): Promise<{
  viewerUrl: string;
}> {
  if (busy) throw new Error("A LinkedIn operation is already in progress");
  busy = true;

  const viewerStatus = await ensureChallengeViewer();
  if (!viewerStatus.available) {
    busy = false;
    throw new Error("Browser viewer is not available");
  }

  const { token } = createChallengeViewerSession({ ttlMs: 15 * 60 * 1000 });
  const viewerUrl = buildChallengeViewerUrl({ token });

  // Launch browser and navigate to login page, then return viewerUrl immediately.
  // The login wait continues in the background so the user can open the viewer
  // and enter credentials while the API response is already delivered.
  let launchOptions: Record<string, unknown> = {
    headless: false,
    args: ["--no-sandbox"],
  };
  try {
    const camoufox = await import("camoufox-js");
    launchOptions = await camoufox.launchOptions({
      headless: false,
      humanize: true,
      geoip: true,
      block_webrtc: true,
    });
  } catch {
    // fallback to vanilla Firefox
  }

  const browser = await firefox.launch(launchOptions);
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto("https://www.linkedin.com/login", {
    waitUntil: "domcontentloaded",
    timeout: 30_000,
  });

  logger.info("LinkedIn login page opened, waiting for user to log in");

  // Continue waiting for login in the background — don't block the HTTP response
  waitForLogin(page, 10 * 60 * 1000)
    .then(async (loggedIn) => {
      if (loggedIn) {
        await saveLinkedInCookies(context);
        lastVerifiedAt = new Date().toISOString();
        logger.info("LinkedIn login successful, cookies saved");
      } else {
        logger.warn("LinkedIn login timed out");
      }
      await browser.close();
    })
    .catch(async (err) => {
      logger.error("LinkedIn login background error", {
        error: err instanceof Error ? err.message : String(err),
      });
      await browser.close().catch(() => {});
    })
    .finally(() => {
      busy = false;
    });

  return { viewerUrl };
}

export async function verifySession(): Promise<{
  valid: boolean;
  profileName?: string;
}> {
  const jar = await readLinkedInCookieJar();
  if (!jar.hasCookies) {
    return { valid: false };
  }

  let launchOptions: Record<string, unknown> = {
    headless: true,
    args: ["--no-sandbox"],
  };
  try {
    const camoufox = await import("camoufox-js");
    launchOptions = await camoufox.launchOptions({
      headless: true,
      humanize: false,
    });
  } catch {
    // fallback
  }

  const browser = await firefox.launch(launchOptions);
  try {
    const context = await browser.newContext(
      jar.userAgent ? { userAgent: jar.userAgent } : undefined,
    );
    await loadLinkedInCookies(context);
    const page = await context.newPage();
    const result = await verifyLinkedInSession(page);

    if (result.valid) {
      lastVerifiedAt = new Date().toISOString();
    }

    return result;
  } finally {
    await browser.close();
  }
}

export async function logoutLinkedIn(): Promise<void> {
  await invalidateLinkedInCookies();
  lastVerifiedAt = null;
}

export async function startEasyApply(
  options: Omit<EasyApplyOptions, "signal">,
): Promise<EasyApplyResult> {
  if (busy) throw new Error("A LinkedIn operation is already in progress");
  busy = true;
  activeAbort = new AbortController();
  resetProgress();

  try {
    return await executeEasyApply({
      ...options,
      signal: activeAbort.signal,
    });
  } finally {
    busy = false;
    activeAbort = null;
  }
}

export function cancelEasyApply(): void {
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
}

export function isBusy(): boolean {
  return busy;
}
