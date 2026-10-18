import { logger } from "@infra/logger";
import { sanitizeUnknown } from "@infra/sanitize";
import { HiringCafeBrowserPages } from "hiringcafe-extractor/src/browser-pages";
import { acquireChallengeViewer } from "./challenge-viewer";

const IDLE_MS = 15 * 60 * 1000;

type Entry = {
  pages: HiringCafeBrowserPages;
  timer: ReturnType<typeof setTimeout>;
};

const sessions = new Map<string, Entry>();

function armExpiry(scopeKey: string, entry: Entry): void {
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    if (sessions.get(scopeKey) !== entry) return;
    sessions.delete(scopeKey);
    void entry.pages.close().catch((error: unknown) => {
      logger.warn("Hiring Cafe browser cleanup failed", {
        scopeKey,
        error: sanitizeUnknown(error),
      });
    });
  }, IDLE_MS);
  entry.timer.unref();
}

function getSession(scopeKey: string, cookieStorageDir: string): Entry {
  const existing = sessions.get(scopeKey);
  if (existing) {
    armExpiry(scopeKey, existing);
    return existing;
  }
  const pages = new HiringCafeBrowserPages({
    cookieStorageDir,
    promoteToHeaded: () => acquireChallengeViewer(scopeKey),
  });
  const entry: Entry = { pages, timer: setTimeout(() => undefined, IDLE_MS) };
  sessions.set(scopeKey, entry);
  armExpiry(scopeKey, entry);
  return entry;
}

export function readHiringCafeBrowserPage(
  scopeKey: string,
  cookieStorageDir: string,
  url: string,
) {
  return getSession(scopeKey, cookieStorageDir).pages.read(url);
}

export async function waitForHiringCafeBrowserChallenge(
  scopeKey: string,
  url: string,
  timeoutMs: number,
): Promise<"clear" | "timeout"> {
  const entry = sessions.get(scopeKey);
  if (!entry)
    throw new Error("Hiring Cafe browser session is no longer available");
  armExpiry(scopeKey, entry);
  return entry.pages.waitForChallenge(url, timeoutMs);
}

export function hasHiringCafeBrowserChallenge(
  scopeKey: string,
  url: string,
): boolean {
  return sessions.get(scopeKey)?.pages.canWaitForChallenge(url) ?? false;
}

export async function closeHiringCafeBrowser(scopeKey: string): Promise<void> {
  const entry = sessions.get(scopeKey);
  if (!entry) return;
  sessions.delete(scopeKey);
  clearTimeout(entry.timer);
  await entry.pages.close();
}
