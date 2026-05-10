/**
 * Per-provider rate-limited fetch wrapper.
 *
 * Features:
 * - Per-provider concurrency semaphore (default: 1 = serial)
 * - Automatic retry on HTTP 429 with Retry-After header support
 * - Per-provider cooldown: one 429 blocks ALL concurrent requests to that provider
 * - Per-request timeout via AbortSignal.timeout
 *
 * Usage:
 *   const fetchImpl = createRateLimitedFetch("workday");
 *   const res = await fetchImpl(url, init);
 */

// ---------------------------------------------------------------------------
// Semaphore
// ---------------------------------------------------------------------------

class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    const next = this.queue.shift();
    if (next) {
      // Hand the slot directly to the next waiter (active count stays the same).
      next();
    } else {
      this.active--;
    }
  }
}

// ---------------------------------------------------------------------------
// Provider state
// ---------------------------------------------------------------------------

interface ProviderState {
  semaphore: Semaphore;
  /** Epoch-ms until which ALL requests to this provider must wait. */
  cooldownUntil: number;
}

const providerStates = new Map<string, ProviderState>();

function getProviderState(provider: string, concurrency: number): ProviderState {
  let state = providerStates.get(provider);
  if (!state) {
    state = { semaphore: new Semaphore(concurrency), cooldownUntil: 0 };
    providerStates.set(provider, state);
  }
  return state;
}

/** Reset all provider state. Intended for tests only. */
export function resetRateLimitState(): void {
  providerStates.clear();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;

  // Try as integer seconds.
  const seconds = Number.parseInt(header, 10);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;

  // Try as HTTP-date.
  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
  }

  return null;
}

function mergeSignal(
  init: RequestInit | undefined,
  timeoutSignal: AbortSignal,
): RequestInit {
  const existing = init?.signal;
  if (!existing) {
    return { ...init, signal: timeoutSignal };
  }
  return { ...init, signal: AbortSignal.any([existing, timeoutSignal]) };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RateLimitedFetchOptions {
  /** Max concurrent requests for this provider key. Default: 1 */
  concurrency?: number;
  /** Per-request timeout in ms. Default: 12 000 */
  timeoutMs?: number;
  /** Fallback cooldown (seconds) when 429 has no Retry-After header. Default: 60 */
  defaultRetryAfterSec?: number;
}

/**
 * Create a rate-limited `fetch` function scoped to a provider key.
 *
 * All calls sharing the same provider key share a concurrency semaphore
 * and a cooldown timer. This means that if provider "workday" gets a 429,
 * all in-flight and queued requests to "workday" will wait.
 */
export function createRateLimitedFetch(
  provider: string,
  options: RateLimitedFetchOptions = {},
): typeof fetch {
  const {
    concurrency = 1,
    timeoutMs = 12_000,
    defaultRetryAfterSec = 60,
  } = options;

  const state = getProviderState(provider, concurrency);

  return async function rateLimitedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      await state.semaphore.acquire();

      let released = false;
      const releaseSemaphore = () => {
        if (!released) {
          released = true;
          state.semaphore.release();
        }
      };

      try {
        // Wait for cooldown if another request triggered a 429.
        const now = Date.now();
        if (state.cooldownUntil > now) {
          await delay(state.cooldownUntil - now);
        }

        const mergedInit = mergeSignal(init, AbortSignal.timeout(timeoutMs));
        const response = await fetch(input, mergedInit);

        if (response.status === 429) {
          const waitSec = parseRetryAfter(response) ?? defaultRetryAfterSec;
          const waitMs = waitSec * 1000;
          state.cooldownUntil = Math.max(state.cooldownUntil, Date.now() + waitMs);
          releaseSemaphore();
          await delay(waitMs);
          continue; // retry from top of loop
        }

        return response;
      } catch (error) {
        throw error;
      } finally {
        releaseSemaphore();
      }
    }
  } as typeof fetch;
}
