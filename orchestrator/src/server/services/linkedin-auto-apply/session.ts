import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { logger } from "@infra/logger";
import type { BrowserContext, Cookie, Page } from "playwright";

const EXTRACTOR_ID = "linkedin-apply";
const COOKIE_FILENAME = `${EXTRACTOR_ID}-cookies.json`;

interface LinkedInCookieJar {
  extractorId: string;
  savedAt: string;
  cookies: Cookie[];
  userAgent?: string;
}

function getStorageDir(): string {
  const dataDir = (process.env.DATA_DIR || "").trim();
  return dataDir
    ? join(dataDir, "cloudflare-cookies")
    : "./storage";
}

function cookiePath(): string {
  return join(getStorageDir(), COOKIE_FILENAME);
}

export async function saveLinkedInCookies(
  context: BrowserContext,
): Promise<void> {
  const allCookies = await context.cookies();
  if (allCookies.length === 0) return;

  let userAgent: string | undefined;
  try {
    const pages = context.pages();
    if (pages.length > 0) {
      userAgent = await pages[0].evaluate(() => navigator.userAgent);
    }
  } catch {
    // ignore UA capture failure
  }

  const jar: LinkedInCookieJar = {
    extractorId: EXTRACTOR_ID,
    savedAt: new Date().toISOString(),
    cookies: allCookies,
    userAgent,
  };

  const filePath = cookiePath();
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(jar, null, 2), "utf-8");
  logger.info("LinkedIn cookies saved", { count: allCookies.length });
}

export async function loadLinkedInCookies(
  context: BrowserContext,
): Promise<number> {
  try {
    const raw = await readFile(cookiePath(), "utf-8");
    const jar = JSON.parse(raw) as LinkedInCookieJar;
    const valid = jar.cookies.filter(
      (c) => c.expires === -1 || c.expires > Date.now() / 1000,
    );
    if (valid.length === 0) return 0;

    await context.addCookies(valid);
    logger.info("LinkedIn cookies loaded", { count: valid.length });
    return valid.length;
  } catch {
    return 0;
  }
}

export async function readLinkedInCookieJar(): Promise<{
  hasCookies: boolean;
  userAgent?: string;
}> {
  try {
    const raw = await readFile(cookiePath(), "utf-8");
    const jar = JSON.parse(raw) as LinkedInCookieJar;
    const valid = jar.cookies.filter(
      (c) => c.expires === -1 || c.expires > Date.now() / 1000,
    );
    return { hasCookies: valid.length > 0, userAgent: jar.userAgent };
  } catch {
    return { hasCookies: false };
  }
}

export async function invalidateLinkedInCookies(): Promise<void> {
  try {
    await unlink(cookiePath());
    logger.info("LinkedIn cookies invalidated");
  } catch {
    // file may not exist
  }
}

export async function verifyLinkedInSession(
  page: Page,
): Promise<{ valid: boolean; profileName?: string }> {
  try {
    await page.goto("https://www.linkedin.com/feed/", {
      waitUntil: "domcontentloaded",
      timeout: 15_000,
    });

    const url = page.url();
    if (url.includes("/login") || url.includes("/authwall")) {
      return { valid: false };
    }

    let profileName: string | undefined;
    try {
      const nameEl = page.locator(
        '[data-control-name="identity_welcome_message"], .feed-identity-module__actor-meta a',
      );
      const text = await nameEl.first().textContent({ timeout: 3_000 });
      if (text) profileName = text.trim();
    } catch {
      // profile name extraction is optional
    }

    return { valid: true, profileName };
  } catch (error) {
    logger.warn("LinkedIn session verification failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { valid: false };
  }
}

export async function waitForLogin(
  page: Page,
  timeoutMs = 300_000,
): Promise<boolean> {
  const start = Date.now();
  const pollMs = 2_000;

  while (Date.now() - start < timeoutMs) {
    const url = page.url();
    if (
      url.includes("/feed") ||
      url.includes("/mynetwork") ||
      url.includes("/messaging") ||
      url.includes("/jobs")
    ) {
      return true;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
  return false;
}
