/**
 * Shared browser resilience utilities for Playwright-based extractors.
 *
 * Use this package when your extractor navigates pages with Playwright and
 * needs to handle Cloudflare WAF challenges, retry transient failures, or
 * persist cookies between runs.
 *
 * NOT for: HTTP-only extractors (adzuna, startupjobs) or Python-based
 * extractors (jobspy). Those don't use Playwright and can't benefit from
 * browser-level anti-detection.
 */

export {
  type ChallengeResult,
  isChallengePage,
  isChallengeResponse,
  navigateWithChallenge,
  waitForChallengeResolution,
} from "./challenge.js";
export {
  type CookieJarInfo,
  getCloudflareCookieStorageDir,
  invalidateCookies,
  loadCookies,
  readCookieJar,
  saveCookies,
} from "./cookies.js";
export {
  type BrowserLaunchOptions,
  createLaunchOptions,
} from "./launch.js";
export {
  type NavigateWithRetryOptions,
  type NavigateWithRetryResult,
  navigateWithRetry,
  type RetryOptions,
  withRetry,
} from "./retry.js";
export { type SolverResult, solveChallenge } from "./solver.js";
