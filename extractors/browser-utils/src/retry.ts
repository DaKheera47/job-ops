import type { Page, Response } from "playwright";
import { type ChallengeResult, navigateWithChallenge } from "./challenge.js";

export interface RetryOptions {
  /** Maximum number of attempts (default 3) */
  maxAttempts?: number;
  /** Base delay in ms — doubled each retry (default 2000) */
  baseDelayMs?: number;
  /** Optional predicate: return true to retry, false to stop */
  shouldRetry?: (error: unknown, attempt: number) => boolean;
}

/**
 * Generic retry wrapper with exponential backoff.
 * Works with any async function — not browser-specific.
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const { maxAttempts = 3, baseDelayMs = 2_000, shouldRetry } = options;

  if (maxAttempts < 1) {
    throw new Error(`withRetry: maxAttempts must be >= 1, got ${maxAttempts}`);
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts) break;
      if (shouldRetry && !shouldRetry(error, attempt)) break;

      const delay = baseDelayMs * 2 ** (attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

export interface NavigateWithRetryOptions {
  /** Max navigation attempts (default 3) */
  maxAttempts?: number;
  /** Base delay between retries in ms (default 2000) */
  baseDelayMs?: number;
  /** Playwright waitUntil option (default "domcontentloaded") */
  waitUntil?: "load" | "domcontentloaded" | "networkidle" | "commit";
  /** Max time to wait for a CF challenge to resolve per attempt (default 30s) */
  challengeTimeoutMs?: number;
  /** Max time for the page.goto call itself (default 30s) */
  navigationTimeoutMs?: number;
  /** Called on each retry with context — useful for logging */
  onRetry?: (info: { attempt: number; reason: string; url: string }) => void;
}

export interface NavigateWithRetryResult {
  response: Response | null;
  challengeResult: ChallengeResult;
  attempts: number;
}

/**
 * Navigates to a URL with automatic retry and Cloudflare challenge handling.
 *
 * On each attempt:
 * 1. Navigates to the URL
 * 2. Checks for CF challenge, waits for resolution if found
 * 3. Retries with backoff if the challenge times out or navigation fails
 *
 * This is the primary function extractors should use for page navigation.
 */
export async function navigateWithRetry(
  page: Page,
  url: string,
  options: NavigateWithRetryOptions = {},
): Promise<NavigateWithRetryResult> {
  const {
    maxAttempts = 3,
    baseDelayMs = 2_000,
    waitUntil = "domcontentloaded",
    challengeTimeoutMs = 30_000,
    navigationTimeoutMs = 30_000,
    onRetry,
  } = options;

  let lastResult: NavigateWithRetryResult | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { response, challengeResult } = await navigateWithChallenge(
        page,
        url,
        { waitUntil, challengeTimeoutMs, navigationTimeoutMs },
      );

      // Challenge resolved or wasn't one — success
      if (
        challengeResult.status === "passed" ||
        challengeResult.status === "not-a-challenge"
      ) {
        return { response, challengeResult, attempts: attempt };
      }

      // Challenge timed out — retry
      lastResult = { response, challengeResult, attempts: attempt };

      if (attempt < maxAttempts) {
        const reason =
          challengeResult.status === "timeout"
            ? "challenge timeout"
            : `challenge ${challengeResult.status}`;
        onRetry?.({ attempt, reason, url });
        const delay = baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      // Navigation error (network, timeout, etc.) — retry
      if (attempt < maxAttempts) {
        const reason = error instanceof Error ? error.message : "unknown error";
        onRetry?.({ attempt, reason, url });
        const delay = baseDelayMs * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  // All retries exhausted — return last result
  // biome-ignore lint/style/noNonNullAssertion: loop guarantees at least one attempt
  return lastResult!;
}
