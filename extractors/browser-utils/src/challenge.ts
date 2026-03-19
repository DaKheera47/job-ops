import type { Page, Response } from "playwright";

export type ChallengeResult =
  | { status: "passed" }
  | { status: "not-a-challenge" }
  | { status: "failed"; reason: string }
  | { status: "timeout" };

/**
 * Content markers that indicate a Cloudflare challenge page.
 * Gathered empirically from CF challenge/interstitial HTML — these will
 * need updating if Cloudflare changes their challenge page structure.
 */
const CF_CHALLENGE_MARKERS = [
  "cf-challenge-running",
  "cf-turnstile",
  "Checking your browser",
  "challenges.cloudflare.com",
  "Just a moment...",
  // Cloudflare's "managed challenge" / interstitial
  "cf-please-wait",
  "cf_chl_opt",
] as const;

/**
 * Checks whether a page is currently showing a Cloudflare challenge.
 * Works by inspecting page content — no network interception needed.
 */
export async function isChallengePage(page: Page): Promise<boolean> {
  try {
    const html = await page.content();
    return CF_CHALLENGE_MARKERS.some((marker) => html.includes(marker));
  } catch {
    // Page may have navigated or crashed — treat as not a challenge
    return false;
  }
}

/**
 * Checks whether an HTTP response looks like a Cloudflare block.
 * Use this to inspect responses from page.goto() or page.waitForResponse().
 */
export function isChallengeResponse(response: Response): boolean {
  const status = response.status();
  // CF challenges typically return 403 or 503 with specific headers
  if (status !== 403 && status !== 503) return false;
  const server = response.headers()["server"] ?? "";
  return server.toLowerCase().includes("cloudflare");
}

/**
 * Waits for a Cloudflare challenge to resolve on the current page.
 *
 * Cloudflare challenges work by showing an interstitial that auto-navigates
 * to the target page once solved. This function polls for the challenge
 * markers to disappear, indicating either success or failure.
 *
 * @param page - Playwright page currently showing a challenge
 * @param timeoutMs - Max time to wait (default 30s — challenges can take 5-15s)
 * @param pollIntervalMs - How often to check (default 1s)
 */
export async function waitForChallengeResolution(
  page: Page,
  timeoutMs = 30_000,
  pollIntervalMs = 1_000,
): Promise<ChallengeResult> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // Check if we've navigated away from the challenge page
    const stillChallenge = await isChallengePage(page);
    if (!stillChallenge) {
      return { status: "passed" };
    }

    await page.waitForTimeout(pollIntervalMs);
  }

  return { status: "timeout" };
}

/**
 * Navigates to a URL and handles Cloudflare challenges transparently.
 * Returns the final response after any challenge is resolved.
 *
 * This is the main entry point most extractors should use instead of
 * raw page.goto(). It handles:
 * - Initial navigation
 * - Challenge detection
 * - Waiting for challenge resolution
 * - Reporting what happened
 */
export async function navigateWithChallenge(
  page: Page,
  url: string,
  options: {
    waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
    challengeTimeoutMs?: number;
    navigationTimeoutMs?: number;
  } = {},
): Promise<{
  response: Response | null;
  challengeResult: ChallengeResult;
}> {
  const {
    waitUntil = "domcontentloaded",
    challengeTimeoutMs = 30_000,
    navigationTimeoutMs = 30_000,
  } = options;

  const response = await page.goto(url, {
    waitUntil,
    timeout: navigationTimeoutMs,
  });

  // Check if the response itself is a CF challenge
  if (response && isChallengeResponse(response)) {
    const challengeResult = await waitForChallengeResolution(
      page,
      challengeTimeoutMs,
    );
    return { response, challengeResult };
  }

  // Response looked fine HTTP-wise, but page content might still be a challenge.
  // CF's "managed challenge" variant returns HTTP 200 with challenge HTML —
  // checking headers alone would miss it.
  if (await isChallengePage(page)) {
    const challengeResult = await waitForChallengeResolution(
      page,
      challengeTimeoutMs,
    );
    return { response, challengeResult };
  }

  return { response, challengeResult: { status: "not-a-challenge" } };
}
