/**
 * Two error classes for LLM-driven pipeline steps.  Both live here (no DB /
 * settings imports) so unit tests can import them without dragging in the
 * better-sqlite3 native binding.
 *
 * The orchestrator and per-step callers MUST distinguish:
 *
 *   • LlmNotConfiguredError — a CONFIG-class problem (no API key, 401/403,
 *     no provider configured, repeated invalid-credentials).  The user has
 *     to fix Settings before anything can resume.  The orchestrator pauses
 *     the whole run and waits for `POST /api/pipeline/resume-scoring`.
 *
 *   • LlmTransientError — a per-call failure that is NOT the user's fault
 *     (timeout, 5xx, 429 rate-limit, garbage JSON for a single job).  The
 *     score-jobs step catches it, marks the single job as scoring_skipped,
 *     and continues.  Only if too many transient failures pile up does the
 *     step give up and escalate to LlmNotConfiguredError so the run pauses.
 *
 * The May 2026 regression was that EVERY LLM failure was reclassified as
 * `LlmNotConfiguredError` and the mock-score fallback was deleted.  A single
 * 503 from GNAI killed the entire run with a misleading "check your API
 * key" message.  Keep the two classes distinct.
 */
export class LlmNotConfiguredError extends Error {
  constructor(message?: string) {
    super(message ?? "LLM API key not configured");
    this.name = "LlmNotConfiguredError";
  }
}

export class LlmTransientError extends Error {
  /** Optional raw error string from the LLM layer, for logging. */
  readonly cause?: string;

  constructor(message: string, cause?: string) {
    super(message);
    this.name = "LlmTransientError";
    this.cause = cause;
  }
}

/**
 * Heuristic classifier for LLM-service error strings.  Used by scorer.ts to
 * decide whether a failure should pause the pipeline (config class) or just
 * skip the current job (transient class).
 *
 * Kept conservative: anything that looks even vaguely like an auth/config
 * problem returns "config" — the user-facing pause message is still
 * accurate enough, and the alternative (silently absorbing config errors
 * and waiting for the failure-rate threshold) wastes tokens.
 */
export function classifyLlmError(rawError: string): "config" | "transient" {
  const e = rawError.toLowerCase();

  // Explicit configuration / auth signals
  if (
    e.includes("api key not configured") ||
    e.includes("api key is missing") ||
    e.includes("no provider configured") ||
    e.includes("provider not configured") ||
    e.includes("401") ||
    e.includes("403") ||
    e.includes("unauthorized") ||
    e.includes("forbidden") ||
    e.includes("invalid api key") ||
    e.includes("authentication") ||
    e.includes("not configured")
  ) {
    return "config";
  }

  // Everything else (5xx, rate limits, timeouts, parse failures on a single
  // response, "all provider modes failed" when the cause is upstream) is
  // treated as transient.  The pipeline can absorb a few of these per run.
  return "transient";
}
