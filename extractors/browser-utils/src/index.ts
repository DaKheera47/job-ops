/**
 * Shared browser resilience utilities for Playwright-based extractors.
 *
 * Use this package when your extractor navigates pages with Playwright and
 * needs to handle Cloudflare WAF challenges, retry transient failures, or
 * persist cookies between runs.
 *
 * HTTP extractors can also reuse the persisted cookie-jar helpers when a
 * headed challenge solve needs to carry over to a fetch-based retry.
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
  createPersistedFetchCookieJar,
  type FetchCookieJar,
  getCloudflareCookieStorageDir,
  invalidateCookies,
  loadCookies,
  type PersistedFetchCookieJarInfo,
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
