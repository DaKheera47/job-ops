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

  try {
    const viewerStatus = await ensureChallengeViewer();
    if (!viewerStatus.available) {
      throw new Error("Browser viewer is not available");
    }

    const { token } = createChallengeViewerSession({ ttlMs: 15 * 60 * 1000 });
    const viewerUrl = buildChallengeViewerUrl({ token });

    // Launch headed browser
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

    // Wait for user to log in (polls URL changes)
    const loggedIn = await waitForLogin(page, 5 * 60 * 1000);

    if (loggedIn) {
      await saveLinkedInCookies(context);
      lastVerifiedAt = new Date().toISOString();
      logger.info("LinkedIn login successful, cookies saved");
    } else {
      logger.warn("LinkedIn login timed out");
    }

    await browser.close();
    return { viewerUrl };
  } finally {
    busy = false;
  }
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
