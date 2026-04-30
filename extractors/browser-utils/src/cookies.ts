import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BrowserContext, Cookie } from "playwright";

/**
 * Cookies worth persisting — CF clearance and common session cookies.
 * cf_clearance is the main one: it proves the browser passed a challenge.
 * The others are supporting cookies CF uses during challenge flow.
 */
const PERSIST_COOKIE_NAMES = new Set([
  "cf_clearance",
  "__cf_bm",
  "cf_chl_2",
  "cf_chl_prog",
  "__cflb",
]);
const DEFAULT_COOKIE_STORAGE_DIR = "./storage";
const DATA_DIR_COOKIE_STORAGE_DIRNAME = "cloudflare-cookies";

interface PersistedCookieJar {
  extractorId: string;
  savedAt: string;
  cookies: Cookie[];
  userAgent?: string;
}

export interface CookieJarInfo {
  hasCookies: boolean;
  userAgent?: string;
}

export function getCloudflareCookieStorageDir(storageDir?: string): string {
  if (storageDir) return storageDir;

  const dataDir = (process.env.DATA_DIR || "").trim();
  if (dataDir) return join(dataDir, DATA_DIR_COOKIE_STORAGE_DIRNAME);

  return DEFAULT_COOKIE_STORAGE_DIR;
}

function cookiePath(storageDir: string, extractorId: string): string {
  return join(storageDir, `${extractorId}-cookies.json`);
}

function isExpired(cookie: Cookie): boolean {
  // expires = -1 means session cookie (no expiry) — keep it, it's still valid
  // for the current process lifetime
  if (cookie.expires === -1) return false;
  return cookie.expires < Date.now() / 1000;
}

/**
 * Saves the browser context's cookies to disk, filtered to CF-relevant cookies.
 * Call this after a successful navigation through a CF challenge.
 *
 * @param context - Playwright browser context to extract cookies from
 * @param extractorId - Unique extractor name (used as filename prefix)
 * @param storageDir - Directory to store cookie files (default: DATA_DIR/cloudflare-cookies when DATA_DIR is set, otherwise ./storage)
 */
export async function saveCookies(
  context: BrowserContext,
  extractorId: string,
  storageDir?: string,
): Promise<void> {
  const resolvedStorageDir = getCloudflareCookieStorageDir(storageDir);
  const allCookies = await context.cookies();

  // Keep CF-related cookies plus any with "session" or "auth" in the name
  const relevant = allCookies.filter(
    (c) =>
      PERSIST_COOKIE_NAMES.has(c.name) ||
      c.name.toLowerCase().includes("session") ||
      c.name.toLowerCase().includes("auth"),
  );

  if (relevant.length === 0) return;

  // Auto-capture the browser's User-Agent so headless retries can reuse it.
  // CF ties cf_clearance to the UA + TLS fingerprint — without matching UA
  // the cookie is useless. We grab it from the first open page; there's
  // always at least one when saving cookies after navigation.
  let userAgent: string | undefined;
  const page = context.pages()[0];
  if (page) {
    userAgent = await page.evaluate(() => navigator.userAgent);
  }

  const jar: PersistedCookieJar = {
    extractorId,
    savedAt: new Date().toISOString(),
    cookies: relevant,
    userAgent,
  };

  const path = cookiePath(resolvedStorageDir, extractorId);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(jar, null, 2));
}

/**
 * Loads previously saved cookies into a browser context.
 * Skips expired cookies automatically.
 *
 * Call this before navigating to a CF-protected site — if we have a valid
 * cf_clearance cookie from a previous run, the challenge may be skipped entirely.
 *
 * @param context - Playwright browser context to inject cookies into
 * @param extractorId - Must match the ID used when saving
 * @param storageDir - Directory where cookie files are stored (default: DATA_DIR/cloudflare-cookies when DATA_DIR is set, otherwise ./storage)
 * @returns Number of cookies loaded (0 if no saved cookies or all expired)
 */
export async function loadCookies(
  context: BrowserContext,
  extractorId: string,
  storageDir?: string,
): Promise<number> {
  const path = cookiePath(
    getCloudflareCookieStorageDir(storageDir),
    extractorId,
  );

  let jar: PersistedCookieJar;
  try {
    const data = await readFile(path, "utf-8");
    jar = JSON.parse(data) as PersistedCookieJar;
  } catch {
    return 0; // no saved cookies
  }

  const valid = jar.cookies.filter((c) => !isExpired(c));
  if (valid.length === 0) return 0;

  await context.addCookies(valid);
  return valid.length;
}

/**
 * Reads cookie jar metadata without needing a Playwright BrowserContext.
 * Use this to check whether valid cookies exist and retrieve the persisted
 * User-Agent before creating a browser context (Playwright requires UA at
 * `newContext()` time).
 */
export async function readCookieJar(
  extractorId: string,
  storageDir?: string,
): Promise<CookieJarInfo> {
  const path = cookiePath(
    getCloudflareCookieStorageDir(storageDir),
    extractorId,
  );

  let jar: PersistedCookieJar;
  try {
    const data = await readFile(path, "utf-8");
    jar = JSON.parse(data) as PersistedCookieJar;
  } catch {
    return { hasCookies: false };
  }

  const hasValid = jar.cookies.some((c) => !isExpired(c));
  return { hasCookies: hasValid, userAgent: jar.userAgent };
}

/**
 * Deletes the cookie jar file for an extractor.
 * Call this when cookies are known to be stale (e.g. after a CF re-challenge).
 */
export async function invalidateCookies(
  extractorId: string,
  storageDir?: string,
): Promise<void> {
  const path = cookiePath(
    getCloudflareCookieStorageDir(storageDir),
    extractorId,
  );
  try {
    await unlink(path);
  } catch {
    // File doesn't exist — nothing to invalidate
  }
}
